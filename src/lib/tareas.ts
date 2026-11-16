import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getSupabaseAdmin } from "@/lib/supabase";
import { diaDe, diaSiguiente, ESTADOS_TAREA, extensionDe, inicioDelDia, PRIORIDADES_TAREA, tocaElDia, type EstadoTarea } from "@/lib/tareas-reglas";

/**
 * Tareas del día y biblioteca de archivos 3D (docs/sdd/012).
 *
 * - El tablero muestra lo abierto y lo terminado hoy (hora de Argentina). No hay proceso a
 *   medianoche: Terminadas se "limpia" sola porque cada tarea guarda cuándo se terminó.
 * - Las que se repiten crean su tarea del día al abrir el tablero, una sola vez por día.
 * - Los archivos van a un bucket privado: se suben y se bajan con links firmados que da el servidor.
 */

export const BUCKET = "archivos-3d";
/** Cuánto dura un link de descarga o de vista previa. */
const LINK_SEGUNDOS = 10 * 60;

export interface TareaVista {
  id: string;
  titulo: string;
  nota: string | null;
  estado: EstadoTarea;
  orden: number;
  prioridad: string;
  responsableId: string | null;
  fechaLimite: string | null;
  motivoTrabada: string | null;
  pasos: Array<{ texto: string; hecho: boolean }>;
  terminadaEn: string | null;
  recurrenteId: string | null;
  creadaEn: string;
  archivos: Array<{ id: string; nombre: string; extension: string | null }>;
}

const conArchivos = { archivos: { select: { archivo: { select: { id: true, nombre: true, extension: true } } } } } as const;

type FilaTarea = Prisma.TareaGetPayload<{ include: typeof conArchivos }>;

function vista(t: FilaTarea): TareaVista {
  return {
    id: t.id,
    titulo: t.titulo,
    nota: t.nota,
    estado: t.estado as EstadoTarea,
    orden: t.orden,
    prioridad: t.prioridad,
    responsableId: t.responsableId,
    fechaLimite: t.fechaLimite ? t.fechaLimite.toISOString().slice(0, 10) : null,
    motivoTrabada: t.motivoTrabada,
    pasos: Array.isArray(t.pasos) ? (t.pasos as Array<{ texto: string; hecho: boolean }>) : [],
    terminadaEn: t.terminadaEn?.toISOString() ?? null,
    recurrenteId: t.recurrenteId,
    creadaEn: t.creadaEn.toISOString(),
    archivos: t.archivos.map((a) => a.archivo),
  };
}

/** Las personas de la cuenta, para asignar tareas. */
export async function personas(tenantId: string) {
  const ps = await prisma.perfil.findMany({ where: { tenantId }, select: { id: true, userId: true, nombre: true, email: true }, orderBy: { nombre: "asc" } });
  return ps.map((p) => ({ id: p.id, userId: p.userId, nombre: p.nombre ?? p.email ?? "Sin nombre" }));
}

/** Crea las tareas de hoy de las que se repiten (una vez por día cada una). */
async function crearLasDeHoy(tenantId: string, hoy: string) {
  const rs = await prisma.tareaRecurrente.findMany({ where: { tenantId, activa: true } });
  const tocan = rs.filter((r) => tocaElDia(r, hoy));
  if (!tocan.length) return;
  const primero = await prisma.tarea.findFirst({ where: { tenantId, estado: "por_hacer" }, orderBy: { orden: "asc" }, select: { orden: true } });
  let orden = (primero?.orden ?? 1000) - 1000;
  for (const r of tocan) {
    // El único (recurrente, día) evita duplicarla si dos pantallas abren el tablero a la vez.
    await prisma.tarea
      .create({
        data: { tenantId, titulo: r.titulo, nota: r.nota, prioridad: r.prioridad, responsableId: r.responsableId, recurrenteId: r.id, diaRecurrencia: new Date(`${hoy}T00:00:00Z`), orden: orden-- },
      })
      .catch((e) => {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
      });
  }
}

/** El tablero de hoy: lo abierto y lo terminado hoy. */
export async function tablero(tenantId: string) {
  const hoy = diaDe(new Date());
  await crearLasDeHoy(tenantId, hoy);
  const filas = await prisma.tarea.findMany({
    where: { tenantId, OR: [{ estado: { not: "terminada" } }, { terminadaEn: { gte: inicioDelDia(hoy) } }] },
    include: conArchivos,
    orderBy: { orden: "asc" },
  });
  return { hoy, tareas: filas.map(vista), personas: await personas(tenantId) };
}

/** Lo terminado entre dos días (inclusive), agrupado por día, el más nuevo primero. */
export async function historial(tenantId: string, desde: string, hasta: string) {
  const filas = await prisma.tarea.findMany({
    where: { tenantId, estado: "terminada", terminadaEn: { gte: inicioDelDia(desde), lt: inicioDelDia(diaSiguiente(hasta)) } },
    include: conArchivos,
    orderBy: { terminadaEn: "desc" },
  });
  const dias = new Map<string, TareaVista[]>();
  for (const f of filas) {
    const d = diaDe(f.terminadaEn!);
    dias.set(d, [...(dias.get(d) ?? []), vista(f)]);
  }
  return { dias: [...dias].map(([dia, tareas]) => ({ dia, tareas })), personas: await personas(tenantId) };
}

export interface CambioDeTarea {
  titulo?: string;
  nota?: string | null;
  estado?: EstadoTarea;
  orden?: number;
  prioridad?: string;
  responsableId?: string | null;
  fechaLimite?: string | null;
  motivoTrabada?: string | null;
  pasos?: Array<{ texto: string; hecho: boolean }>;
  archivos?: string[];
}

function datosDe(c: CambioDeTarea) {
  const d: Prisma.TareaUncheckedUpdateInput = {};
  if (c.titulo !== undefined) d.titulo = c.titulo.trim().slice(0, 300);
  if (c.nota !== undefined) d.nota = c.nota?.trim() || null;
  if (c.prioridad !== undefined && (PRIORIDADES_TAREA as readonly string[]).includes(c.prioridad)) d.prioridad = c.prioridad;
  if (c.responsableId !== undefined) d.responsableId = c.responsableId || null;
  if (c.fechaLimite !== undefined) d.fechaLimite = c.fechaLimite ? new Date(`${c.fechaLimite}T00:00:00Z`) : null;
  if (c.motivoTrabada !== undefined) d.motivoTrabada = c.motivoTrabada?.trim() || null;
  if (c.pasos !== undefined) d.pasos = c.pasos.filter((p) => p.texto?.trim()).map((p) => ({ texto: p.texto.trim(), hecho: !!p.hecho }));
  if (c.orden !== undefined && Number.isFinite(c.orden)) d.orden = c.orden;
  return d;
}

export async function crearTarea(tenantId: string, usuario: string, c: CambioDeTarea & { titulo: string }) {
  const estado: EstadoTarea = c.estado && (ESTADOS_TAREA as readonly string[]).includes(c.estado) ? c.estado : "por_hacer";
  const ultimo = await prisma.tarea.findFirst({ where: { tenantId, estado }, orderBy: { orden: "desc" }, select: { orden: true } });
  const t = await prisma.tarea.create({
    data: {
      ...(datosDe(c) as Prisma.TareaUncheckedCreateInput),
      tenantId,
      titulo: c.titulo.trim().slice(0, 300),
      estado,
      orden: c.orden ?? (ultimo?.orden ?? 0) + 1000,
      terminadaEn: estado === "terminada" ? new Date() : null,
      creadaPor: usuario,
      archivos: c.archivos?.length ? { create: c.archivos.map((archivoId) => ({ archivoId })) } : undefined,
    },
    include: conArchivos,
  });
  return vista(t);
}

export async function cambiarTarea(tenantId: string, id: string, c: CambioDeTarea) {
  const antes = await prisma.tarea.findFirst({ where: { id, tenantId }, select: { estado: true } });
  if (!antes) return null;
  const d = datosDe(c);
  if (c.estado && (ESTADOS_TAREA as readonly string[]).includes(c.estado) && c.estado !== antes.estado) {
    d.estado = c.estado;
    // Terminar guarda cuándo; sacarla de Terminadas lo borra. Salir de Trabadas borra el motivo.
    d.terminadaEn = c.estado === "terminada" ? new Date() : null;
    if (antes.estado === "trabada" && c.motivoTrabada === undefined) d.motivoTrabada = null;
  }
  const t = await prisma.$transaction(async (tx) => {
    if (c.archivos) {
      await tx.tareaArchivo.deleteMany({ where: { tareaId: id } });
      if (c.archivos.length) await tx.tareaArchivo.createMany({ data: c.archivos.map((archivoId) => ({ tareaId: id, archivoId })), skipDuplicates: true });
    }
    return tx.tarea.update({ where: { id }, data: d, include: conArchivos });
  });
  return vista(t);
}

export async function borrarTarea(tenantId: string, id: string) {
  const r = await prisma.tarea.deleteMany({ where: { id, tenantId } });
  return r.count > 0;
}

/* ───────────────────────── Las que se repiten ───────────────────────── */

export async function recurrentes(tenantId: string) {
  return prisma.tareaRecurrente.findMany({ where: { tenantId }, orderBy: [{ activa: "desc" }, { creadaEn: "asc" }] });
}

export interface DatosDeRecurrente {
  titulo?: string;
  nota?: string | null;
  frecuencia?: string;
  dias?: number[];
  responsableId?: string | null;
  prioridad?: string;
  activa?: boolean;
}

function datosDeRecurrente(c: DatosDeRecurrente) {
  const d: Prisma.TareaRecurrenteUncheckedUpdateInput = {};
  if (c.titulo !== undefined) d.titulo = c.titulo.trim().slice(0, 300);
  if (c.nota !== undefined) d.nota = c.nota?.trim() || null;
  if (c.frecuencia !== undefined && ["diaria", "semanal", "mensual"].includes(c.frecuencia)) d.frecuencia = c.frecuencia;
  if (c.dias !== undefined) d.dias = [...new Set(c.dias.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 31))];
  if (c.responsableId !== undefined) d.responsableId = c.responsableId || null;
  if (c.prioridad !== undefined && (PRIORIDADES_TAREA as readonly string[]).includes(c.prioridad)) d.prioridad = c.prioridad;
  if (c.activa !== undefined) d.activa = !!c.activa;
  return d;
}

export async function crearRecurrente(tenantId: string, c: DatosDeRecurrente & { titulo: string; frecuencia: string }) {
  return prisma.tareaRecurrente.create({ data: { ...(datosDeRecurrente(c) as Prisma.TareaRecurrenteUncheckedCreateInput), tenantId, titulo: c.titulo.trim(), frecuencia: c.frecuencia } });
}

export async function cambiarRecurrente(tenantId: string, id: string, c: DatosDeRecurrente) {
  const r = await prisma.tareaRecurrente.updateMany({ where: { id, tenantId }, data: datosDeRecurrente(c) as Prisma.TareaRecurrenteUpdateManyMutationInput });
  return r.count > 0;
}

export async function borrarRecurrente(tenantId: string, id: string) {
  const r = await prisma.tareaRecurrente.deleteMany({ where: { id, tenantId } });
  return r.count > 0;
}

/* ───────────────────────── Archivos 3D ───────────────────────── */

export interface ArchivoVista {
  id: string;
  nombre: string;
  extension: string | null;
  tamano: number;
  carpeta: string | null;
  etiquetas: string[];
  miniatura: string | null;
  subidoPor: string | null;
  creadoEn: string;
  tareas: number;
}

const storage = () => getSupabaseAdmin().storage.from(BUCKET);

export async function archivos(tenantId: string): Promise<ArchivoVista[]> {
  const filas = await prisma.archivo3d.findMany({ where: { tenantId, subido: true }, orderBy: { creadoEn: "desc" }, include: { _count: { select: { tareas: true } } } });
  // Las miniaturas, con links firmados de una vez.
  const conMini = filas.filter((f) => f.miniaturaRuta);
  const firmadas = conMini.length ? ((await storage().createSignedUrls(conMini.map((f) => f.miniaturaRuta!), 60 * 60)).data ?? []) : [];
  const mini = new Map(conMini.map((f, i) => [f.id, firmadas[i]?.signedUrl ?? null]));
  return filas.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    extension: f.extension,
    tamano: Number(f.tamano),
    carpeta: f.carpeta,
    etiquetas: f.etiquetas,
    miniatura: mini.get(f.id) ?? null,
    subidoPor: f.subidoPor,
    creadoEn: f.creadoEn.toISOString(),
    tareas: f._count.tareas,
  }));
}

/** Un nombre de archivo seguro para la ruta del bucket. */
const seguro = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(-120);

/** Prepara una subida: la fila (sin confirmar) y el link firmado para que el navegador suba directo. */
export async function prepararSubida(tenantId: string, usuario: string, a: { nombre: string; tamano: number; carpeta?: string | null }) {
  const nombre = a.nombre.trim().slice(0, 200);
  const fila = await prisma.archivo3d.create({
    data: { tenantId, nombre, ruta: "", tamano: BigInt(Math.max(0, Math.round(a.tamano))), extension: extensionDe(nombre) || null, carpeta: a.carpeta?.trim() || null, subidoPor: usuario },
  });
  const ruta = `${tenantId}/${fila.id}/${seguro(nombre)}`;
  const { data, error } = await storage().createSignedUploadUrl(ruta);
  if (error || !data) {
    await prisma.archivo3d.delete({ where: { id: fila.id } });
    throw new Error(`No se pudo preparar la subida: ${error?.message ?? "sin respuesta"}`);
  }
  await prisma.archivo3d.update({ where: { id: fila.id }, data: { ruta } });
  return { id: fila.id, ruta, token: data.token };
}

/** El navegador terminó de subir: se confirma (y se mira que el archivo esté). */
export async function confirmarSubida(tenantId: string, id: string) {
  const f = await prisma.archivo3d.findFirst({ where: { id, tenantId } });
  if (!f) return null;
  const carpeta = f.ruta.split("/").slice(0, -1).join("/");
  const { data } = await storage().list(carpeta);
  const esta = (data ?? []).find((o) => `${carpeta}/${o.name}` === f.ruta);
  if (!esta) throw new Error("El archivo no llegó al almacenamiento");
  const tamano = (esta.metadata as { size?: number } | null)?.size;
  await prisma.archivo3d.update({ where: { id }, data: { subido: true, ...(tamano ? { tamano: BigInt(tamano) } : {}) } });
  return true;
}

/** Un link firmado para bajar el archivo (o para verlo en el visor). */
export async function linkDeArchivo(tenantId: string, id: string, descargar: boolean) {
  const f = await prisma.archivo3d.findFirst({ where: { id, tenantId, subido: true } });
  if (!f) return null;
  const { data, error } = await storage().createSignedUrl(f.ruta, LINK_SEGUNDOS, descargar ? { download: f.nombre } : undefined);
  if (error || !data) throw new Error(error?.message ?? "No se pudo firmar el link");
  return { url: data.signedUrl, nombre: f.nombre, extension: f.extension };
}

/** Link firmado para subir la miniatura (png) que arma el visor. */
export async function prepararMiniatura(tenantId: string, id: string) {
  const f = await prisma.archivo3d.findFirst({ where: { id, tenantId } });
  if (!f) return null;
  const ruta = `${tenantId}/${f.id}/miniatura.png`;
  const { data, error } = await storage().createSignedUploadUrl(ruta, { upsert: true });
  if (error || !data) throw new Error(error?.message ?? "No se pudo preparar la miniatura");
  await prisma.archivo3d.update({ where: { id }, data: { miniaturaRuta: ruta } });
  return { ruta, token: data.token };
}

export async function cambiarArchivo(tenantId: string, id: string, c: { nombre?: string; carpeta?: string | null; etiquetas?: string[] }) {
  const r = await prisma.archivo3d.updateMany({
    where: { id, tenantId },
    data: {
      ...(c.nombre?.trim() ? { nombre: c.nombre.trim().slice(0, 200) } : {}),
      ...(c.carpeta !== undefined ? { carpeta: c.carpeta?.trim() || null } : {}),
      ...(c.etiquetas ? { etiquetas: [...new Set(c.etiquetas.map((e) => e.trim()).filter(Boolean))].slice(0, 20) } : {}),
    },
  });
  return r.count > 0;
}

/** Borra el archivo del almacenamiento y la fila (se desengancha de las tareas). */
export async function borrarArchivo(tenantId: string, id: string) {
  const f = await prisma.archivo3d.findFirst({ where: { id, tenantId } });
  if (!f) return false;
  const rutas = [f.ruta, f.miniaturaRuta].filter((r): r is string => !!r);
  if (rutas.length) await storage().remove(rutas);
  await prisma.archivo3d.delete({ where: { id } });
  return true;
}
