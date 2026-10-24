import { prisma } from "@/lib/prisma";
import { nombreDe, sembrarCombinacionesDeModelo, soltarVariantesBorradas } from "@/lib/combinaciones";
import { agregarAccesorio } from "@/lib/recetas";
import { ESTADOS_QUE_RESERVAN } from "@/lib/reservas";
import { asegurarFilasDeStock } from "@/lib/stock-filas";

/**
 * Los grupos de variantes de un producto (docs/sdd/004, spec 003).
 *
 * Una variante pertenece a un grupo ("Color", "Funda", "Diseño") y el grupo dice qué es:
 *
 *   - **pieza**: cada opción se imprime aparte. Tiene su fila de stock y su pieza de Bodega
 *     (`afectaStock`). Los colores de la Bola de JOJOS, los diseños de la jabonera.
 *   - **insumo**: "Con X" descuenta un insumo y "Sin X" no. La funda de una katana.
 *   - **decoracion**: la misma pieza para todas las opciones. Las firmas del vaso.
 *
 * Hasta acá las variantes se editaban todas juntas desde el lápiz, emparejadas por nombre:
 * renombrar una era borrarla y crear otra, y sus combinaciones quedaban desactivadas. Acá cada
 * operación va por id y termina igual que el PUT de siempre: filas de stock y combinaciones.
 */

export const TIPOS = ["pieza", "insumo", "decoracion"] as const;
export type TipoGrupo = (typeof TIPOS)[number];

export class ErrorDeCatalogo extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const clave = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
const limpio = (s: string) => s.trim().replace(/\s+/g, " ");
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const CON_SIN = /^(con|sin)\s+(.+)$/i;

export const esTipo = (t: unknown): t is TipoGrupo => typeof t === "string" && (TIPOS as readonly string[]).includes(t);

interface VarianteBase {
  id: string;
  nombre: string;
  afectaStock: boolean;
  grupo: string | null;
  tipo: string | null;
}

/** El tipo de una variante, aunque todavía no tenga uno guardado (antes del relleno). */
export function tipoDeVariante(v: Pick<VarianteBase, "nombre" | "afectaStock" | "tipo">): TipoGrupo {
  if (esTipo(v.tipo)) return v.tipo;
  if (v.afectaStock) return "pieza";
  return CON_SIN.test(v.nombre.trim()) ? "insumo" : "decoracion";
}

/** El grupo de una variante, aunque todavía no tenga uno guardado. */
export function grupoDeVariante(v: Pick<VarianteBase, "nombre" | "afectaStock" | "grupo">): string {
  if (v.grupo?.trim()) return v.grupo.trim();
  const m = CON_SIN.exec(v.nombre.trim());
  if (m && !v.afectaStock) return capital(m[2].trim());
  return "Variante";
}

export interface Grupo<V extends VarianteBase = VarianteBase> {
  nombre: string;
  tipo: TipoGrupo;
  opciones: V[];
}

/** Las variantes agrupadas, en el orden en que aparecen. */
export function gruposDe<V extends VarianteBase>(variantes: V[]): Grupo<V>[] {
  const out: Grupo<V>[] = [];
  for (const v of variantes) {
    const nombre = grupoDeVariante(v);
    let g = out.find((x) => clave(x.nombre) === clave(nombre));
    if (!g) {
      g = { nombre, tipo: tipoDeVariante(v), opciones: [] };
      out.push(g);
    }
    g.opciones.push(v);
  }
  return out;
}

async function cargar(tenantId: string, modeloId: string) {
  const m = await prisma.modelo.findFirst({
    where: { id: modeloId, tenantId },
    select: {
      id: true,
      nombre: true,
      esInsumo: true,
      variantes: { where: { activo: true }, select: { id: true, nombre: true, afectaStock: true, grupo: true, tipo: true } },
    },
  });
  if (!m) throw new ErrorDeCatalogo("producto no encontrado", 404);
  return m;
}

async function variante(tenantId: string, varianteId: string) {
  const v = await prisma.varianteModelo.findFirst({
    where: { id: varianteId, modelo: { tenantId } },
    select: { id: true, nombre: true, afectaStock: true, grupo: true, tipo: true, modeloId: true },
  });
  if (!v) throw new ErrorDeCatalogo("opción no encontrada", 404);
  return v;
}

/** Lo que hace el PUT de siempre al final: filas de stock y combinaciones al día. */
async function terminar(tenantId: string, modeloId: string) {
  await asegurarFilasDeStock(tenantId, modeloId);
  await sembrarCombinacionesDeModelo(prisma, tenantId, modeloId);
}

/** Nombres sin repetir, ni entre sí ni contra las opciones que ya tiene el producto. */
function opcionesNuevas(nombres: string[], existentes: Array<{ nombre: string }>): string[] {
  const vistas = new Set<string>();
  const out: string[] = [];
  for (const n of nombres.map(limpio).filter(Boolean)) {
    if (vistas.has(clave(n))) continue;
    vistas.add(clave(n));
    out.push(n);
  }
  if (out.length === 0) throw new ErrorDeCatalogo("faltan las opciones");
  const ya = new Set(existentes.map((v) => clave(v.nombre)));
  const repetida = out.find((n) => ya.has(clave(n)));
  if (repetida) throw new ErrorDeCatalogo(`ya hay una opción "${repetida}" en este producto`);
  return out;
}

/**
 * El nombre de las combinaciones y la etiqueta de las filas de stock salen del nombre del
 * producto y de sus variantes: después de renombrar se recalculan. El SKU no se toca (un SKU
 * nunca se mueve, spec 003, RN-5).
 */
export async function actualizarNombres(tenantId: string, modeloId: string): Promise<void> {
  const m = await prisma.modelo.findFirst({
    where: { id: modeloId, tenantId },
    select: { nombre: true, variantes: { select: { id: true, nombre: true } } },
  });
  if (!m) return;
  const nombreDeVariante = new Map(m.variantes.map((v) => [v.id, v.nombre]));
  const nombresDe = (ids: string[]) => {
    const ns = ids.map((id) => nombreDeVariante.get(id));
    return ns.every(Boolean) ? (ns as string[]).sort((a, b) => a.localeCompare(b)) : null;
  };

  const combinaciones = await prisma.combinacion.findMany({ where: { tenantId, modeloId }, select: { id: true, nombre: true, variantes: true } });
  for (const c of combinaciones) {
    const ns = nombresDe(c.variantes);
    if (!ns) continue; // una variante borrada: es historia, se deja como está
    const nombre = nombreDe(m.nombre, ns);
    if (nombre !== c.nombre) await prisma.combinacion.update({ where: { id: c.id }, data: { nombre } });
  }

  const filas = await prisma.stock.findMany({ where: { tenantId, modeloId }, select: { id: true, etiqueta: true, variantes: true } });
  for (const f of filas) {
    const ns = nombresDe(f.variantes);
    if (!ns) continue;
    const etiqueta = [m.nombre, ...ns].join(" · ");
    if (etiqueta !== f.etiqueta) await prisma.stock.update({ where: { id: f.id }, data: { etiqueta } });
  }
}

/** "Agregar grupo" (spec 003, REQ-4). */
export async function crearGrupo(
  tenantId: string,
  modeloId: string,
  input: { nombre: string; tipo: TipoGrupo; opciones?: string[]; insumoStockId?: string | null }
): Promise<void> {
  const nombre = limpio(input.nombre ?? "");
  if (!nombre) throw new ErrorDeCatalogo("falta el nombre del grupo");
  if (!esTipo(input.tipo)) throw new ErrorDeCatalogo("el tipo tiene que ser pieza, insumo o decoracion");

  const m = await cargar(tenantId, modeloId);
  if (m.esInsumo) throw new ErrorDeCatalogo("un insumo no tiene variantes");
  const grupos = gruposDe(m.variantes);
  if (grupos.some((g) => clave(g.nombre) === clave(nombre))) throw new ErrorDeCatalogo(`ya hay un grupo "${nombre}"`);
  // RN-1: a lo sumo uno de piezas y uno de insumo; de decoración, los que hagan falta.
  const mismoTipo = grupos.find((g) => g.tipo === input.tipo);
  if (input.tipo !== "decoracion" && mismoTipo) {
    throw new ErrorDeCatalogo(
      input.tipo === "pieza"
        ? `ya tiene el grupo "${mismoTipo.nombre}" de piezas: un producto tiene uno solo (para otro tamaño, otro producto)`
        : `ya tiene el grupo "${mismoTipo.nombre}" de insumo: un producto tiene uno solo`
    );
  }

  if (input.tipo === "insumo") {
    // El par "Con X" / "Sin X" y su receta, como "Agregar accesorio".
    await agregarAccesorio(tenantId, modeloId, nombre, input.insumoStockId ?? null);
    return;
  }

  const opciones = opcionesNuevas(input.opciones ?? [], m.variantes);
  await prisma.varianteModelo.createMany({
    data: opciones.map((o) => ({ modeloId, nombre: o, grupo: nombre, tipo: input.tipo, afectaStock: input.tipo === "pieza" })),
  });
  await terminar(tenantId, modeloId);
}

/** Opciones nuevas en un grupo que ya existe (spec 003, REQ-8). */
export async function agregarOpciones(tenantId: string, modeloId: string, grupo: string, nombres: string[]): Promise<void> {
  const m = await cargar(tenantId, modeloId);
  const g = gruposDe(m.variantes).find((x) => clave(x.nombre) === clave(grupo));
  if (!g) throw new ErrorDeCatalogo(`no hay un grupo "${grupo}"`, 404);
  if (g.tipo === "insumo") throw new ErrorDeCatalogo('un grupo de insumo tiene sólo "Con" y "Sin"');
  const opciones = opcionesNuevas(nombres, m.variantes);
  await prisma.varianteModelo.createMany({
    data: opciones.map((o) => ({ modeloId, nombre: o, grupo: g.nombre, tipo: g.tipo, afectaStock: g.tipo === "pieza" })),
  });
  await terminar(tenantId, modeloId);
}

/** Renombrar una opción conservándola: mismas combinaciones, filas y mapeos (spec 003, REQ-7). */
export async function renombrarVariante(tenantId: string, varianteId: string, nombre: string): Promise<void> {
  const v = await variante(tenantId, varianteId);
  const nuevo = limpio(nombre ?? "");
  if (!nuevo) throw new ErrorDeCatalogo("falta el nombre");
  if (tipoDeVariante(v) === "insumo") throw new ErrorDeCatalogo('"Con" y "Sin" se renombran cambiando el nombre del grupo');
  const m = await cargar(tenantId, v.modeloId);
  if (m.variantes.some((x) => x.id !== v.id && clave(x.nombre) === clave(nuevo))) {
    throw new ErrorDeCatalogo(`ya hay una opción "${nuevo}" en este producto`);
  }
  await prisma.varianteModelo.update({ where: { id: v.id }, data: { nombre: nuevo } });
  await actualizarNombres(tenantId, v.modeloId);
}

/** Renombrar un grupo; en uno de insumo, también "Con X" y "Sin X". */
export async function renombrarGrupo(tenantId: string, modeloId: string, grupo: string, nombre: string): Promise<void> {
  const nuevo = limpio(nombre ?? "");
  if (!nuevo) throw new ErrorDeCatalogo("falta el nombre del grupo");
  const m = await cargar(tenantId, modeloId);
  const grupos = gruposDe(m.variantes);
  const g = grupos.find((x) => clave(x.nombre) === clave(grupo));
  if (!g) throw new ErrorDeCatalogo(`no hay un grupo "${grupo}"`, 404);
  if (grupos.some((x) => x !== g && clave(x.nombre) === clave(nuevo))) throw new ErrorDeCatalogo(`ya hay un grupo "${nuevo}"`);

  const titulo = capital(nuevo);
  await prisma.$transaction(async (tx) => {
    for (const o of g.opciones) {
      const conSin = CON_SIN.exec(o.nombre.trim());
      const data: { grupo: string; tipo: TipoGrupo; nombre?: string } = { grupo: g.tipo === "insumo" ? titulo : nuevo, tipo: g.tipo };
      if (g.tipo === "insumo" && conSin) data.nombre = `${capital(conSin[1].toLowerCase())} ${titulo}`;
      await tx.varianteModelo.update({ where: { id: o.id }, data });
    }
  });
  await actualizarNombres(tenantId, modeloId);
}

/** Lo que tiene una fila de stock que impide borrarla sin perder información. */
async function filaConHistoria(filaId: string): Promise<boolean> {
  const f = await prisma.stock.findUnique({
    where: { id: filaId },
    select: { cantidad: true, bodegaModelId: true, _count: { select: { movimientos: true, reservas: true, reglasInsumo: true } } },
  });
  if (!f) return false;
  return f.cantidad !== 0 || !!f.bodegaModelId || f._count.movimientos > 0 || f._count.reservas > 0 || f._count.reglasInsumo > 0;
}

/**
 * Las filas de stock de unas variantes que dejan de ser piezas: las vacías se borran; las que
 * tienen stock, pieza de Bodega o movimientos quedan y se cuentan (spec 003, RN-6).
 */
async function soltarFilas(tenantId: string, modeloId: string, varianteIds: string[]): Promise<number> {
  const filas = await prisma.stock.findMany({ where: { tenantId, modeloId, variantes: { hasSome: varianteIds } }, select: { id: true } });
  let quedan = 0;
  for (const f of filas) {
    if (await filaConHistoria(f.id)) quedan++;
    else await prisma.stock.delete({ where: { id: f.id } });
  }
  return quedan;
}

/** Pasar un grupo entre pieza y decoración (spec 003, RN-6). Devuelve cuántas filas quedaron. */
export async function cambiarTipoDeGrupo(tenantId: string, modeloId: string, grupo: string, tipo: TipoGrupo): Promise<{ filasQueQuedan: number }> {
  if (tipo === "insumo") throw new ErrorDeCatalogo("un grupo de insumo se crea con «Agregar grupo», con su Con y su Sin");
  const m = await cargar(tenantId, modeloId);
  const grupos = gruposDe(m.variantes);
  const g = grupos.find((x) => clave(x.nombre) === clave(grupo));
  if (!g) throw new ErrorDeCatalogo(`no hay un grupo "${grupo}"`, 404);
  if (g.tipo === "insumo") throw new ErrorDeCatalogo("un grupo de insumo no cambia de tipo: se borra y se crea otro");
  if (g.tipo === tipo) return { filasQueQuedan: 0 };
  if (tipo === "pieza" && grupos.some((x) => x !== g && x.tipo === "pieza")) {
    throw new ErrorDeCatalogo("ya tiene un grupo de piezas: un producto tiene uno solo");
  }

  const ids = g.opciones.map((o) => o.id);
  await prisma.varianteModelo.updateMany({ where: { id: { in: ids } }, data: { tipo, afectaStock: tipo === "pieza", grupo: g.nombre } });
  const filasQueQuedan = tipo === "decoracion" ? await soltarFilas(tenantId, modeloId, ids) : 0;
  await terminar(tenantId, modeloId);
  return { filasQueQuedan };
}

/** Importes y notas de una opción. */
export async function actualizarVariante(
  tenantId: string,
  varianteId: string,
  datos: { precioAdicional?: number; costoFabAdicional?: number; costoInsumosAdicional?: number; notas?: string | null }
): Promise<void> {
  const v = await variante(tenantId, varianteId);
  const data: Record<string, number | string | null> = {};
  for (const k of ["precioAdicional", "costoFabAdicional", "costoInsumosAdicional"] as const) {
    if (datos[k] === undefined) continue;
    const n = Number(datos[k]);
    if (!Number.isFinite(n) || n < 0) throw new ErrorDeCatalogo(`${k} tiene que ser un número desde 0`);
    data[k] = n;
  }
  if (datos.notas !== undefined) data.notas = datos.notas?.trim() || null;
  if (Object.keys(data).length) await prisma.varianteModelo.update({ where: { id: v.id }, data });
}

/** Ventas abiertas que reservan alguna de estas variantes: mientras existan, no se borran. */
async function ventasAbiertas(tenantId: string, varianteIds: string[]): Promise<number> {
  return prisma.itemPedido.count({
    where: {
      combinacion: { tenantId, variantes: { hasSome: varianteIds } },
      pedido: { tenantId, estado: { in: [...ESTADOS_QUE_RESERVAN] } },
    },
  });
}

async function borrarVariantes(tenantId: string, modeloId: string, ids: string[]): Promise<{ filasQueQuedan: number }> {
  const abiertas = await ventasAbiertas(tenantId, ids);
  if (abiertas > 0) throw new ErrorDeCatalogo(`hay ${abiertas} ${abiertas === 1 ? "venta abierta" : "ventas abiertas"} con esto: cerralas o cambialas antes`, 409);
  // Combinaciones desactivadas (son historia de lo que se vendió) y recetas borradas.
  await soltarVariantesBorradas(prisma, tenantId, modeloId, ids);
  const filasQueQuedan = await soltarFilas(tenantId, modeloId, ids);
  const pubs = await prisma.publicacionMl.findMany({ where: { tenantId, modeloId, variantesImplicitas: { hasSome: ids } }, select: { id: true, variantesImplicitas: true } });
  for (const p of pubs) {
    await prisma.publicacionMl.update({ where: { id: p.id }, data: { variantesImplicitas: p.variantesImplicitas.filter((x) => !ids.includes(x)) } });
  }
  await prisma.varianteModelo.deleteMany({ where: { id: { in: ids }, modeloId } });
  await terminar(tenantId, modeloId);
  return { filasQueQuedan };
}

/** Borrar una opción (spec 003, REQ-9). Las de un grupo de insumo se borran con el grupo. */
export async function borrarVariante(tenantId: string, varianteId: string): Promise<{ filasQueQuedan: number }> {
  const v = await variante(tenantId, varianteId);
  if (tipoDeVariante(v) === "insumo") throw new ErrorDeCatalogo('"Con" y "Sin" se borran con el grupo');
  return borrarVariantes(tenantId, v.modeloId, [v.id]);
}

/** Borrar un grupo entero. */
export async function borrarGrupo(tenantId: string, modeloId: string, grupo: string): Promise<{ filasQueQuedan: number }> {
  const m = await cargar(tenantId, modeloId);
  const g = gruposDe(m.variantes).find((x) => clave(x.nombre) === clave(grupo));
  if (!g) throw new ErrorDeCatalogo(`no hay un grupo "${grupo}"`, 404);
  return borrarVariantes(tenantId, modeloId, g.opciones.map((o) => o.id));
}
