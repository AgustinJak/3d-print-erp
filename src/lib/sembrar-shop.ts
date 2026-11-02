import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { claveDe } from "@/lib/combinaciones";
import { claveShop, describirVenta, esAmbigua, resolverLinea } from "@/lib/mapeo-canal";
import { deducirLineaShop } from "@/lib/mapeo-shop";
import { reasignarReservas } from "@/lib/reservas";

/**
 * Siembra del mapeo del Shop desde su catálogo (docs/sdd/001, spec 004, REQ-7).
 *
 * Por cada producto activo de la web, una clave por cada combinación de sus opciones
 * (`<producto_id>|<opcion_ids>`), resuelta con la misma lógica que el webhook. Así un
 * producto nuevo aparece en Integraciones › Mapeo antes de su primera venta.
 *
 * El catálogo se lee de la base del Shop con su clave publicable, la misma que usa la
 * tienda en el navegador: sólo ve productos y opciones activos (RLS del Shop) y no
 * puede escribir. **No toca nada en el Shop.**
 */

const URL_POR_DEFECTO = "https://zxvjyqezicalyjhvobow.supabase.co";
/**
 * La clave publicable del Shop no es un secreto: viaja en el JavaScript de la tienda a
 * cualquier navegador. Va como valor por defecto para no depender de una variable más;
 * `SHOP_SUPABASE_PUBLISHABLE_KEY` la pisa si el Shop la rota.
 */
const CLAVE_PUBLICABLE_POR_DEFECTO = "sb_publishable_dV6wb6ss952rUbKduxYwxg_Zspf-7Ic";

export interface OpcionShop {
  id: string;
  valor: string;
}
export interface GrupoShop {
  id: string;
  nombre: string;
  opciones: OpcionShop[];
}
export interface ProductoShop {
  id: string;
  sku: string | null;
  nombre: string;
  grupos: GrupoShop[];
}
type Elegida = { grupoId: string; grupo: string; opcionId: string; nombre: string };

/** Un grupo "Pack" o "Cantidad" no es una variante: da las unidades (spec 004, RN-8). */
export const ES_PACK = /^\s*(pack|cantidad)\s*$/i;

/** Todas las combinaciones de una opción por grupo. Los grupos sin opciones no cuentan. */
export function combinacionesDeOpciones(grupos: GrupoShop[]): Elegida[][] {
  let out: Elegida[][] = [[]];
  for (const g of grupos) {
    if (g.opciones.length === 0) continue;
    out = out.flatMap((pre) =>
      g.opciones.map((o) => [...pre, { grupoId: g.id, grupo: g.nombre, opcionId: o.id, nombre: o.valor }])
    );
  }
  return out;
}

/** "10 unidades ($2250u)" en un grupo Pack = 10. */
export function unidadesDePack(elegidas: Elegida[]): number {
  for (const e of elegidas) {
    if (!ES_PACK.test(e.grupo)) continue;
    const n = Number(/(\d+)\s*unidad/i.exec(e.nombre)?.[1]);
    if (Number.isInteger(n) && n >= 1) return n;
  }
  return 1;
}

interface FilaApi {
  id: string;
  sku: string | null;
  nombre: string;
  variante_grupos: Array<{
    id: string;
    nombre: string;
    orden: number | null;
    variante_opciones: Array<{ id: string; valor: string; orden: number | null }>;
  }>;
}

const porOrden = (a: { orden: number | null }, b: { orden: number | null }) => (a.orden ?? 0) - (b.orden ?? 0);

/** Los productos activos del Shop con sus grupos y opciones activas, en el orden de la tienda. */
export async function leerCatalogoShop(): Promise<ProductoShop[]> {
  const clave = (process.env.SHOP_SUPABASE_PUBLISHABLE_KEY || CLAVE_PUBLICABLE_POR_DEFECTO).trim();
  const base = (process.env.SHOP_SUPABASE_URL || URL_POR_DEFECTO).trim().replace(/\/+$/, "");

  const select = "id,sku,nombre,variante_grupos(id,nombre,orden,variante_opciones(id,valor,orden))";
  const r = await fetch(`${base}/rest/v1/productos?select=${select}&activo=eq.true&order=created_at.asc`, {
    headers: { apikey: clave, Accept: "application/json" },
    cache: "no-store",
  });
  if (!r.ok) {
    const pista = r.status === 401 ? " (¿el Shop cambió su clave publicable? cargala en SHOP_SUPABASE_PUBLISHABLE_KEY)" : "";
    throw new Error(`el Shop respondió ${r.status} al leer el catálogo${pista}: ${(await r.text()).slice(0, 200)}`);
  }
  const filas = (await r.json()) as FilaApi[];

  return filas.map((p) => ({
    id: p.id,
    sku: p.sku,
    nombre: p.nombre,
    grupos: [...p.variante_grupos].sort(porOrden).map((g) => ({
      id: g.id,
      nombre: g.nombre,
      opciones: [...g.variante_opciones].sort(porOrden).map((o) => ({ id: o.id, valor: o.valor })),
    })),
  }));
}

export interface ResultadoSiembraShop {
  productos: number;
  claves: number;
  mapeadas: number;
  enCola: number;
  /** Claves que ya estaban registradas (mapeadas, en la cola o de otro negocio). */
  yaExistian: number;
  ignoradas: number;
  /** Líneas de pedidos abiertos que esperaban una clave que ahora se resolvió. */
  lineasCompletadas: number;
  detalle: Array<{ clave: string; descripcion: string; unidades: number; resultado: string }>;
}

/**
 * Con `simular` no escribe nada: dice qué haría. Idempotente: una clave ya mapeada o de
 * otro negocio no se toca, y una que está en la cola y nadie tocó a mano se vuelve a
 * intentar resolver (como hace el webhook).
 */
export async function sembrarMapeosShop(
  tenantId: string,
  opts: { simular?: boolean; catalogo?: ProductoShop[] } = {}
): Promise<ResultadoSiembraShop> {
  const catalogo = opts.catalogo ?? (await leerCatalogoShop());
  const out: ResultadoSiembraShop = {
    productos: catalogo.length,
    claves: 0,
    mapeadas: 0,
    enCola: 0,
    yaExistian: 0,
    ignoradas: 0,
    lineasCompletadas: 0,
    detalle: [],
  };

  const claves = catalogo.flatMap((p) =>
    combinacionesDeOpciones(p.grupos).map((elegidas) => ({
      p,
      elegidas,
      clave: claveShop({
        productoId: p.id,
        sku: p.sku,
        nombre: p.nombre,
        opciones: elegidas.map((e) => ({ opcionId: e.opcionId, nombre: e.nombre })),
      }),
    }))
  );
  // Todas las que ya existen de una vez: con una consulta por clave tardaba minutos.
  const existentes = new Map(
    (
      await prisma.mapeoCanal.findMany({
        where: { tenantId, canal: "shop", clave: { in: claves.map((k) => k.clave) } },
        include: { combinacion: { select: { nombre: true, activo: true } } },
      })
    ).map((m) => [m.clave, m])
  );

  for (const { p, elegidas, clave } of claves) {
    out.claves++;
    const unidades = unidadesDePack(elegidas);
    const descripcion = describirVenta(p.nombre, elegidas.map((e) => ({ grupo: e.grupo, nombre: e.nombre })));

    const existente = existentes.get(clave);
    if (existente) out.yaExistian++;
    // Lo ya resuelto no se vuelve a deducir: es casi todo el catálogo y la siembra es para lo nuevo.
    if (existente?.ignorar) {
      out.ignoradas++;
      out.detalle.push({ clave, descripcion, unidades: existente.unidades, resultado: "otro negocio" });
      continue;
    }
    if (existente?.combinacion?.activo) {
      out.mapeadas++;
      out.detalle.push({ clave, descripcion, unidades: existente.unidades, resultado: `ya mapeada → ${existente.combinacion.nombre}` });
      continue;
    }

    const d = await deducirLineaShop(prisma, tenantId, {
      sku: p.sku,
      nombre_producto: p.nombre.trim(),
      opciones_seleccionadas: elegidas
        .filter((e) => !ES_PACK.test(e.grupo))
        .map((e) => ({ grupo: e.grupo, nombre: e.nombre, precio_extra: 0 })),
    });
    const sugerencia = d.modelo ? { modeloId: d.modelo.id, variantes: d.variantes, sinDudas: d.avisos.length === 0 } : null;

    if (opts.simular) {
      let resultado: string;
      if (existente?.origen === "manual") resultado = "cola";
      else if (!sugerencia) resultado = "cola: sin modelo en el ERP (ni por SKU ni por nombre)";
      else if (!sugerencia.sinDudas) resultado = `cola: ${d.avisos.join("; ")}`;
      else if (await esAmbigua(prisma, tenantId, sugerencia.modeloId, sugerencia.variantes)) {
        resultado = `cola: "${d.modelo!.nombre}" solo, sin decir cuál variante`;
      } else {
        const c = await prisma.combinacion.findUnique({
          where: { tenantId_clave: { tenantId, clave: claveDe(sugerencia.modeloId, sugerencia.variantes) } },
          select: { nombre: true, activo: true },
        });
        resultado = c
          ? c.activo
            ? `→ ${c.nombre}`
            : `cola: ${c.nombre} está desactivada`
          : `→ combinación nueva de "${d.modelo!.nombre}"`;
      }
      if (resultado.startsWith("→")) out.mapeadas++;
      else out.enCola++;
      out.detalle.push({ clave, descripcion, unidades, resultado });
      continue;
    }

    const r = await resolverLinea(prisma, tenantId, "shop", clave, {
      sugerencia,
      descripcion,
      muestra: {
        producto_id: p.id,
        sku: p.sku,
        nombre_producto: p.nombre,
        opciones: elegidas.map((e) => ({ grupo_id: e.grupoId, grupo: e.grupo, opcion_id: e.opcionId, nombre: e.nombre })),
      } as Prisma.InputJsonValue,
      contar: false,
      origen: "siembra",
    });
    // Las unidades de un pack las pone la siembra; si alguien las cambió a mano, mandan esas.
    if (unidades > 1 && !existente) {
      await prisma.mapeoCanal.updateMany({ where: { id: r.mapeoId, origen: { not: "manual" } }, data: { unidades } });
    }
    if (r.tipo === "combinacion") {
      out.mapeadas++;
      out.lineasCompletadas += r.completadas ?? 0;
    } else if (r.tipo === "ignorar") out.ignoradas++;
    else out.enCola++;
    out.detalle.push({ clave, descripcion, unidades, resultado: r.tipo === "combinacion" ? `→ ${r.combinacion.nombre}` : r.tipo });
  }

  if (out.lineasCompletadas > 0) await reasignarReservas(tenantId);
  return out;
}
