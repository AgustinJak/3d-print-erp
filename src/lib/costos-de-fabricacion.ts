import { prisma } from "@/lib/prisma";
import { leerParametros } from "@/lib/costos-bodega";
import { aplicarCostosSiCambio } from "@/lib/sincronizar-costos";
import type { ParametrosCosto } from "@/lib/costos-formula";
import { numeroEscrito, validarTaller } from "@/lib/costos-taller";

/**
 * Cuánto cuesta fabricar, editado en el ERP (desde el 2026-11-18): el precio por kilo de cada
 * material y los parámetros del taller (luz, consumo, desgaste y margen de error).
 *
 * Viven donde vivían, en `bodega.materials` y `bodega.cost_settings`, porque de ahí los lee la
 * fórmula (`costos-bodega.ts`) y de ahí los baja la Bodega. Lo que cambia es quién escribe: hasta
 * la 2.39 los subía la Bodega desde su Configuración; desde la 2.40 la Bodega sólo los baja.
 *
 * Al guardar se recalculan los costos de los productos (`aplicarCostosSiCambio`). No publica
 * ningún precio: Precios propone los nuevos y se aplican como siempre.
 */

const TENANT_DE_BODEGA = "sendero3d";

export interface MaterialDeFabricacion {
  id: string;
  nombre: string;
  precioKg: number;
  porDefecto: boolean;
  activo: boolean;
  /** Cuántas piezas lo tienen elegido. */
  piezas: number;
}

export interface CostosDeFabricacion {
  parametros: ParametrosCosto;
  materiales: MaterialDeFabricacion[];
  /** Las piezas sin material elegido usan el por defecto. */
  piezasSinMaterial: number;
  actualizadoEn: string | null;
}

export async function leerCostosDeFabricacion(): Promise<CostosDeFabricacion> {
  const [parametros, materiales, [sinMaterial], [fecha]] = await Promise.all([
    leerParametros(),
    prisma.$queryRaw<Array<{ id: string; nombre: string; precio_kg: unknown; por_defecto: boolean; activo: boolean; piezas: bigint }>>`
      SELECT m.id, m.nombre, m.precio_kg, m.por_defecto, m.activo,
             (SELECT count(*) FROM bodega.models p WHERE p.material_id = m.id) AS piezas
        FROM bodega.materials m
       ORDER BY m.activo DESC, m.por_defecto DESC, m.nombre`,
    prisma.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) AS n FROM bodega.models WHERE material_id IS NULL`,
    prisma.$queryRaw<Array<{ t: Date | null }>>`
      SELECT GREATEST((SELECT max(updated_at) FROM bodega.materials), (SELECT updated_at FROM bodega.cost_settings WHERE id = 'default')) AS t`,
  ]);
  return {
    parametros,
    materiales: materiales.map((m) => ({
      id: m.id,
      nombre: m.nombre,
      precioKg: Number(m.precio_kg),
      porDefecto: m.por_defecto,
      activo: m.activo,
      piezas: Number(m.piezas),
    })),
    piezasSinMaterial: Number(sinMaterial?.n ?? 0),
    actualizadoEn: fecha?.t ? new Date(fecha.t).toISOString() : null,
  };
}

export type Resultado = { ok: true; modelos: number } | { error: string };

async function recalcular(tenantId: string): Promise<number> {
  const r = await aplicarCostosSiCambio(tenantId).catch((e) => {
    console.error("[costos-de-fabricacion] costos:", e);
    return { modelos: 0 };
  });
  return r.modelos;
}

export async function guardarTaller(tenantId: string, c: Record<string, unknown>): Promise<Resultado> {
  if (tenantId !== TENANT_DE_BODEGA) return { error: "Los costos de fabricación son de Sendero 3D" };
  const v = validarTaller(c);
  if ("error" in v) return v;
  if (!Object.keys(v.cambios).length) return { error: "No hay nada para guardar" };
  const p = { ...(await leerParametros()), ...v.cambios };
  // `cost_settings` no tiene trigger: la fecha la pone esto, y es la que mira el recálculo.
  await prisma.$executeRaw`
    INSERT INTO bodega.cost_settings (id, precio_kg, precio_kwh, consumo_w, desgaste_horas, precio_repuestos, margen_error, updated_at)
    VALUES ('default', ${p.precioKg}, ${p.precioKwh}, ${p.consumoW}, ${p.desgasteHoras}, ${p.precioRepuestos}, ${p.margenError}, now())
    ON CONFLICT (id) DO UPDATE SET
      precio_kwh = excluded.precio_kwh, consumo_w = excluded.consumo_w, desgaste_horas = excluded.desgaste_horas,
      precio_repuestos = excluded.precio_repuestos, margen_error = excluded.margen_error, updated_at = now()`;
  return { ok: true, modelos: await recalcular(tenantId) };
}

/**
 * Crea o cambia un material. Nunca se borra (las piezas lo referencian): se desactiva.
 *
 * El por defecto es uno solo (hay un índice único arriba), así que el viejo se apaga antes de
 * prender el nuevo, en la misma transacción. Y `cost_settings.precio_kg` sigue al precio del por
 * defecto, como hacía la Bodega: lo usan las piezas que no eligieron material.
 */
export async function guardarMaterial(
  tenantId: string,
  c: { id?: unknown; nombre?: unknown; precioKg?: unknown; porDefecto?: unknown; activo?: unknown }
): Promise<Resultado> {
  if (tenantId !== TENANT_DE_BODEGA) return { error: "Los materiales son de Sendero 3D" };
  const id = typeof c.id === "string" && c.id ? c.id : null;
  const [actual] = id
    ? await prisma.$queryRaw<Array<{ nombre: string; precio_kg: unknown; por_defecto: boolean; activo: boolean }>>`
        SELECT nombre, precio_kg, por_defecto, activo FROM bodega.materials WHERE id = ${id}`
    : [];
  if (id && !actual) return { error: "Ese material no existe" };

  const nombre = "nombre" in c ? (typeof c.nombre === "string" ? c.nombre.trim() : "") : actual?.nombre ?? "";
  if (!nombre) return { error: "Poné el nombre del material" };
  if (nombre.length > 80) return { error: "El nombre es muy largo" };
  const precioKg = "precioKg" in c ? numeroEscrito(c.precioKg) : actual ? Number(actual.precio_kg) : null;
  if (precioKg == null || precioKg <= 0 || precioKg > 10_000_000) return { error: "El precio por kilo tiene que ser mayor a cero" };
  const porDefecto = "porDefecto" in c ? c.porDefecto === true : actual?.por_defecto ?? false;
  const activo = "activo" in c ? c.activo !== false : actual?.activo ?? true;
  if (actual?.por_defecto && !porDefecto) return { error: "Elegí otro material por defecto en vez de sacarle la marca a este" };
  if (porDefecto && !activo) return { error: "El material por defecto no se puede desactivar" };

  const [repetido] = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM bodega.materials WHERE lower(nombre) = lower(${nombre}) AND id IS DISTINCT FROM ${id} LIMIT 1`;
  if (repetido) return { error: "Ya hay un material con ese nombre" };

  await prisma.$transaction(async (tx) => {
    if (porDefecto && !actual?.por_defecto) {
      await tx.$executeRaw`UPDATE bodega.materials SET por_defecto = false WHERE por_defecto`;
    }
    if (id) {
      await tx.$executeRaw`
        UPDATE bodega.materials SET nombre = ${nombre}, precio_kg = ${precioKg}, por_defecto = ${porDefecto}, activo = ${activo}
         WHERE id = ${id}`;
    } else {
      await tx.$executeRaw`
        INSERT INTO bodega.materials (id, nombre, precio_kg, por_defecto, activo)
        VALUES (gen_random_uuid()::text, ${nombre}, ${precioKg}, ${porDefecto}, ${activo})`;
    }
    if (porDefecto) {
      await tx.$executeRaw`
        UPDATE bodega.cost_settings SET precio_kg = ${precioKg}, updated_at = now()
         WHERE id = 'default' AND precio_kg IS DISTINCT FROM ${precioKg}::numeric`;
    }
  });
  return { ok: true, modelos: await recalcular(tenantId) };
}
