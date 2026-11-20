import { prisma } from "@/lib/prisma";
import { ALIAS_MINIMO, TIPOS_DE_TEMA, leerTema, normalizar, temaDeTexto, type TipoDeTema } from "@/lib/temas";
import { busquedasRecientes, calendarioProximo, productosConVentas, productosDelTema, type EventoEnVista } from "@/lib/tendencias-vista";

/**
 * Crear y editar temas, descartar búsquedas y cargar eventos a mano (docs/sdd/016). Nada de esto
 * toca productos ni publicaciones (RN-3, RN-6).
 */

const TENANT = "sendero3d";
type Resultado<T = unknown> = ({ ok: true } & T) | { error: string };

const esTipo = (t: unknown): t is TipoDeTema => typeof t === "string" && (TIPOS_DE_TEMA as readonly string[]).includes(t);
const aliasValidos = (xs: string[]) => [...new Set(xs.map(normalizar).filter((a) => a.length >= ALIAS_MINIMO))];

async function nombreLibre(nombre: string, salvo: string | null): Promise<boolean> {
  const [f] = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM public.temas WHERE tenant_id = ${TENANT} AND lower(nombre) = lower(${nombre}) AND id IS DISTINCT FROM ${salvo} LIMIT 1`;
  return !f;
}

export async function crearTema(c: { nombre?: unknown; tipo?: unknown; palabra?: unknown }): Promise<Resultado<{ id: string }>> {
  const nombre = typeof c.nombre === "string" ? c.nombre.trim() : "";
  if (nombre.length < 2 || nombre.length > 60) return { error: "El nombre va de 2 a 60 letras" };
  if (c.tipo !== undefined && !esTipo(c.tipo)) return { error: "Ese tipo no existe" };
  if (!(await nombreLibre(nombre, null))) return { error: "Ya hay un tema con ese nombre" };
  const alias = aliasValidos([nombre, ...(typeof c.palabra === "string" ? [c.palabra] : [])]);
  if (!alias.length) return { error: "El nombre necesita al menos 3 letras para reconocer búsquedas" };
  const t = await prisma.tema.create({ data: { nombre, tipo: esTipo(c.tipo) ? c.tipo : "otro", alias } });
  return { ok: true, id: t.id };
}

export async function editarTema(
  id: string,
  c: { nombre?: unknown; tipo?: unknown; alias?: unknown; sumarAlias?: unknown; activo?: unknown; unirCon?: unknown }
): Promise<Resultado> {
  const actual = await prisma.tema.findFirst({ where: { id, tenantId: TENANT } });
  if (!actual) return { error: "No existe ese tema" };
  const data: { nombre?: string; tipo?: string; alias?: string[]; activo?: boolean } = {};

  if (c.nombre !== undefined) {
    const nombre = typeof c.nombre === "string" ? c.nombre.trim() : "";
    if (nombre.length < 2 || nombre.length > 60) return { error: "El nombre va de 2 a 60 letras" };
    if (!(await nombreLibre(nombre, id))) return { error: "Ya hay un tema con ese nombre" };
    data.nombre = nombre;
  }
  if (c.tipo !== undefined) {
    if (!esTipo(c.tipo)) return { error: "Ese tipo no existe" };
    data.tipo = c.tipo;
  }
  if (c.activo !== undefined) data.activo = c.activo !== false;

  let alias = actual.alias;
  if (c.alias !== undefined) {
    if (!Array.isArray(c.alias) || !c.alias.every((a) => typeof a === "string")) return { error: "Los alias van como lista de palabras" };
    alias = aliasValidos(c.alias as string[]);
    if (!alias.length) return { error: "Un tema necesita al menos un alias de 3 letras" };
  }
  if (typeof c.sumarAlias === "string") {
    const a = normalizar(c.sumarAlias);
    if (a.length < ALIAS_MINIMO) return { error: "El alias necesita al menos 3 letras" };
    alias = [...new Set([...alias, a])];
  }

  // Unir: los alias y los eventos del otro tema pasan a este, y el otro se borra.
  if (typeof c.unirCon === "string" && c.unirCon) {
    if (c.unirCon === id) return { error: "No se puede unir un tema consigo mismo" };
    const otro = await prisma.tema.findFirst({ where: { id: c.unirCon, tenantId: TENANT } });
    if (!otro) return { error: "No existe el tema a unir" };
    alias = [...new Set([...alias, ...otro.alias])];
    await prisma.$transaction([
      prisma.eventoTendencia.updateMany({ where: { temaId: otro.id }, data: { temaId: id } }),
      prisma.tema.update({ where: { id }, data: { ...data, alias } }),
      prisma.tema.delete({ where: { id: otro.id } }),
    ]);
    return { ok: true };
  }

  if (alias !== actual.alias) data.alias = alias;
  if (!Object.keys(data).length) return { error: "No hay nada para cambiar" };
  await prisma.tema.update({ where: { id }, data });
  return { ok: true };
}

export async function descartarBusqueda(palabra: unknown): Promise<Resultado> {
  const n = typeof palabra === "string" ? normalizar(palabra) : "";
  if (!n) return { error: "Falta la palabra" };
  await prisma.busquedaDescartada.upsert({ where: { tenantId_normalizada: { tenantId: TENANT, normalizada: n } }, create: { normalizada: n }, update: {} });
  return { ok: true };
}

export async function volverBusqueda(palabra: unknown): Promise<Resultado> {
  const n = typeof palabra === "string" ? normalizar(palabra) : "";
  if (!n) return { error: "Falta la palabra" };
  await prisma.busquedaDescartada.deleteMany({ where: { tenantId: TENANT, normalizada: n } });
  return { ok: true };
}

export interface FichaDeTema {
  tema: { id: string; nombre: string; tipo: TipoDeTema; alias: string[]; activo: boolean };
  productos: Array<{ id: string; nombre: string; foto: string | null; activo: boolean; ultimos30: number; anteriores30: number }>;
  busquedas: Array<{ palabra: string; categoriaId: string; categoria: string | null; posicion: number; nueva: boolean }>;
  /** Cuántos días de los últimos 30 apareció cada búsqueda del tema (por palabra normalizada). */
  constancia: Record<string, number>;
  eventos: EventoEnVista[];
  lectura: ReturnType<typeof leerTema>;
  fotoMl: string | null;
}

export async function fichaDeTema(id: string): Promise<FichaDeTema | null> {
  const t = await prisma.tema.findFirst({ where: { id, tenantId: TENANT } });
  if (!t) return null;
  const todos = await prisma.tema.findMany({ where: { tenantId: TENANT, activo: true }, select: { id: true, nombre: true, alias: true } });
  const [productos, recientes, calendario] = await Promise.all([productosConVentas(), busquedasRecientes(), calendarioProximo(365, todos)]);
  const prods = productosDelTema(t.alias, productos).sort((a, b) => Number(b.activo) - Number(a.activo) || b.ultimos30 - a.ultimos30);
  const busquedas = recientes.filas.filter((b) => temaDeTexto(b.palabra, todos)?.id === t.id).sort((a, b) => a.posicion - b.posicion);

  const constancia: Record<string, number> = {};
  if (busquedas.length) {
    const filas = await prisma.$queryRaw<Array<{ normalizada: string; dias: bigint }>>`
      SELECT normalizada, count(DISTINCT dia) AS dias FROM public.busquedas_ml
       WHERE tenant_id = ${TENANT} AND dia >= now() - interval '30 days' AND normalizada = ANY(${busquedas.map((b) => b.normalizada)})
       GROUP BY normalizada`;
    for (const f of filas) constancia[f.normalizada] = Number(f.dias);
  }

  const eventos = calendario.filter((e) => e.temaId === t.id);
  const activos = prods.filter((p) => p.activo);
  const ventas = { ultimos30: prods.reduce((n, p) => n + p.ultimos30, 0), anteriores30: prods.reduce((n, p) => n + p.anteriores30, 0) };
  return {
    tema: { id: t.id, nombre: t.nombre, tipo: t.tipo as TipoDeTema, alias: t.alias, activo: t.activo },
    productos: prods.map((p) => ({ id: p.id, nombre: p.nombre, foto: p.foto, activo: p.activo, ultimos30: p.ultimos30, anteriores30: p.anteriores30 })),
    busquedas,
    constancia,
    eventos,
    lectura: leerTema({ busquedas, eventos, ventas, productos: activos.length }),
    fotoMl: recientes.dia,
  };
}

const TIPOS_DE_EVENTO = ["pelicula", "serie", "anime", "concierto", "fecha_comercial", "gaming", "evento"] as const;

/** Un evento cargado a mano (un recital, una convención): fuente "manual". */
export async function crearEvento(c: { titulo?: unknown; tipo?: unknown; fecha?: unknown; fechaFin?: unknown; temaId?: unknown; anual?: unknown }): Promise<Resultado<{ id: string }>> {
  const titulo = typeof c.titulo === "string" ? c.titulo.trim() : "";
  if (titulo.length < 2 || titulo.length > 120) return { error: "El título va de 2 a 120 letras" };
  const tipo = typeof c.tipo === "string" && (TIPOS_DE_EVENTO as readonly string[]).includes(c.tipo) ? c.tipo : "evento";
  const fecha = typeof c.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.fecha) ? new Date(`${c.fecha}T00:00:00Z`) : null;
  if (!fecha || isNaN(fecha.getTime())) return { error: "Falta la fecha" };
  const fechaFin = typeof c.fechaFin === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.fechaFin) ? new Date(`${c.fechaFin}T00:00:00Z`) : null;
  if (fechaFin && fechaFin < fecha) return { error: "La fecha de fin es antes que la de inicio" };
  const temaId = typeof c.temaId === "string" && c.temaId ? c.temaId : null;
  if (temaId && !(await prisma.tema.findFirst({ where: { id: temaId, tenantId: TENANT }, select: { id: true } }))) return { error: "No existe ese tema" };
  const e = await prisma.eventoTendencia.create({
    data: { tenantId: TENANT, titulo, tipo, fecha, fechaFin, temaId, anual: c.anual === true, fuente: "manual", fuenteId: `manual-${crypto.randomUUID()}` },
  });
  return { ok: true, id: e.id };
}

/** Cambiar el tema de un evento (o sacárselo), o archivarlo. Los manuales también se borran. */
export async function editarEvento(id: string, c: { temaId?: unknown; archivado?: unknown; borrar?: unknown }): Promise<Resultado> {
  const e = await prisma.eventoTendencia.findFirst({ where: { id, tenantId: TENANT }, select: { id: true, fuente: true } });
  if (!e) return { error: "No existe ese evento" };
  if (c.borrar === true) {
    if (e.fuente !== "manual") return { error: "Sólo se borran los eventos cargados a mano; los demás se archivan" };
    await prisma.eventoTendencia.delete({ where: { id } });
    return { ok: true };
  }
  const data: { temaId?: string | null; archivado?: boolean } = {};
  if (c.temaId !== undefined) {
    const temaId = typeof c.temaId === "string" && c.temaId ? c.temaId : null;
    if (temaId && !(await prisma.tema.findFirst({ where: { id: temaId, tenantId: TENANT }, select: { id: true } }))) return { error: "No existe ese tema" };
    data.temaId = temaId;
  }
  if (c.archivado !== undefined) data.archivado = c.archivado === true;
  if (!Object.keys(data).length) return { error: "No hay nada para cambiar" };
  await prisma.eventoTendencia.update({ where: { id }, data });
  return { ok: true };
}
