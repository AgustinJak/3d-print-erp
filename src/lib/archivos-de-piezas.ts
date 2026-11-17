import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getSupabaseAdmin } from "@/lib/supabase";
import { BUCKET } from "@/lib/tareas";

/**
 * El archivo de cada pieza de Bodega (docs/sdd/014, spec 001). El archivo vive en la biblioteca
 * privada (`archivos_3d`, bucket `archivos-3d`) y `piezas_archivo` dice cuál es el de cada pieza y,
 * si el 3MF tiene varias, qué placa. Un archivo puede ser de varias piezas: los colores comparten
 * modelo y un 3MF puede tener un diseño por placa.
 */

/** Las placas como se guardan en `archivos_3d.placas`. */
export interface PlacaGuardada {
  n: number;
  nombre: string;
  miniatura: string | null;
  gramos: number | null;
  segundos: number | null;
}

export interface PlacaVista {
  n: number;
  nombre: string;
  miniatura: string | null;
  gramos: number | null;
  segundos: number | null;
}

export interface ArchivoDePieza {
  archivoId: string;
  nombre: string;
  extension: string | null;
  tamano: number;
  /** La placa de esta pieza; null = el archivo entero. */
  placa: number | null;
  /** La miniatura de su placa, o la del archivo (link firmado de una hora). */
  miniatura: string | null;
  placas: PlacaVista[];
  /** Cuántas piezas usan el mismo archivo (contando ésta). */
  compartidoPor: number;
}

const storage = () => getSupabaseAdmin().storage.from(BUCKET);
const MINIATURA_SEGUNDOS = 60 * 60;

const placasDe = (j: Prisma.JsonValue | null): PlacaGuardada[] => (Array.isArray(j) ? (j as unknown as PlacaGuardada[]) : []);

/** El archivo de cada pieza pedida (las que no tienen, no vienen). */
export async function archivosDePiezas(tenantId: string, ids: string[]): Promise<Record<string, ArchivoDePieza>> {
  if (ids.length === 0) return {};
  const enganches = await prisma.piezaArchivo.findMany({
    where: { tenantId, bodegaModelId: { in: ids }, archivo: { subido: true } },
    include: { archivo: { select: { id: true, nombre: true, extension: true, tamano: true, miniaturaRuta: true, placas: true, _count: { select: { piezas: true } } } } },
  });

  // Todas las miniaturas de una vez: la del archivo y las de sus placas.
  const rutas = new Set<string>();
  for (const e of enganches) {
    if (e.archivo.miniaturaRuta) rutas.add(e.archivo.miniaturaRuta);
    for (const p of placasDe(e.archivo.placas)) if (p.miniatura) rutas.add(p.miniatura);
  }
  const lista = [...rutas];
  const firmadas = lista.length ? ((await storage().createSignedUrls(lista, MINIATURA_SEGUNDOS)).data ?? []) : [];
  const firmada = new Map(lista.map((r, i) => [r, firmadas[i]?.signedUrl ?? null]));

  const salida: Record<string, ArchivoDePieza> = {};
  for (const e of enganches) {
    const placas = placasDe(e.archivo.placas).map((p) => ({ ...p, miniatura: p.miniatura ? (firmada.get(p.miniatura) ?? null) : null }));
    const deSuPlaca = e.placa != null ? placas.find((p) => p.n === e.placa)?.miniatura : null;
    salida[e.bodegaModelId] = {
      archivoId: e.archivo.id,
      nombre: e.archivo.nombre,
      extension: e.archivo.extension,
      tamano: Number(e.archivo.tamano),
      placa: e.placa,
      miniatura: deSuPlaca ?? (e.archivo.miniaturaRuta ? (firmada.get(e.archivo.miniaturaRuta) ?? null) : null),
      placas,
      compartidoPor: e.archivo._count.piezas,
    };
  }
  return salida;
}

export interface ArchivoConPlacas {
  id: string;
  nombre: string;
  extension: string | null;
  tamano: number;
  miniatura: string | null;
  placas: PlacaVista[];
}

/** Un archivo de la biblioteca con sus placas y miniaturas firmadas (para elegirlo en el alta). */
export async function archivoConPlacas(tenantId: string, id: string): Promise<ArchivoConPlacas | null> {
  const a = await prisma.archivo3d.findFirst({
    where: { id, tenantId, subido: true },
    select: { id: true, nombre: true, extension: true, tamano: true, miniaturaRuta: true, placas: true },
  });
  if (!a) return null;
  const placas = placasDe(a.placas);
  const rutas = [a.miniaturaRuta, ...placas.map((p) => p.miniatura)].filter((r): r is string => !!r);
  const firmadas = rutas.length ? ((await storage().createSignedUrls(rutas, MINIATURA_SEGUNDOS)).data ?? []) : [];
  const firmada = new Map(rutas.map((r, i) => [r, firmadas[i]?.signedUrl ?? null]));
  return {
    id: a.id,
    nombre: a.nombre,
    extension: a.extension,
    tamano: Number(a.tamano),
    miniatura: a.miniaturaRuta ? (firmada.get(a.miniaturaRuta) ?? null) : null,
    placas: placas.map((p) => ({ ...p, miniatura: p.miniatura ? (firmada.get(p.miniatura) ?? null) : null })),
  };
}

/**
 * Engancha una pieza a un archivo de la biblioteca (y una placa), o la suelta con `archivoId` null.
 * Soltar no borra el archivo: queda en la biblioteca.
 */
export async function engancharPieza(tenantId: string, bodegaModelId: string, archivoId: string | null, placa: number | null) {
  if (!archivoId) {
    await prisma.piezaArchivo.deleteMany({ where: { tenantId, bodegaModelId } });
    return { ok: true as const };
  }
  const archivo = await prisma.archivo3d.findFirst({ where: { id: archivoId, tenantId, subido: true }, select: { placas: true } });
  if (!archivo) return { error: "No existe ese archivo en la biblioteca" };
  if (placa != null && !placasDe(archivo.placas).some((p) => p.n === placa)) return { error: `El archivo no tiene la placa ${placa}` };
  await prisma.piezaArchivo.upsert({
    where: { bodegaModelId },
    create: { bodegaModelId, tenantId, archivoId, placa },
    update: { archivoId, placa, actualizadoEn: new Date() },
  });
  return { ok: true as const };
}

/**
 * Guarda lo que el navegador leyó del 3MF (placas, gramos, tiempo y el sha256) y devuelve los
 * tokens firmados para subir las miniaturas de las placas y la del archivo.
 */
export async function guardarLectura(
  tenantId: string,
  archivoId: string,
  l: { hash?: string | null; placas: Array<{ n: number; nombre: string; gramos: number | null; segundos: number | null; conMiniatura: boolean }>; conMiniatura: boolean }
) {
  const f = await prisma.archivo3d.findFirst({ where: { id: archivoId, tenantId } });
  if (!f) return null;
  const base = `${tenantId}/${f.id}`;
  const subidas: Array<{ placa: number | null; ruta: string; token: string }> = [];
  const firmar = async (ruta: string, placa: number | null) => {
    const { data, error } = await storage().createSignedUploadUrl(ruta, { upsert: true });
    if (error || !data) throw new Error(error?.message ?? "No se pudo preparar la miniatura");
    subidas.push({ placa, ruta, token: data.token });
  };

  const placas: PlacaGuardada[] = [];
  for (const p of l.placas.slice(0, 200)) {
    const n = Math.round(Number(p.n));
    if (!Number.isFinite(n) || n < 1) continue;
    const miniatura = p.conMiniatura ? `${base}/placa-${n}.png` : null;
    if (miniatura) await firmar(miniatura, n);
    placas.push({
      n,
      nombre: String(p.nombre ?? "").slice(0, 120),
      miniatura,
      gramos: Number.isFinite(p.gramos) ? p.gramos : null,
      segundos: Number.isFinite(p.segundos) ? p.segundos : null,
    });
  }
  let miniaturaRuta = f.miniaturaRuta;
  if (l.conMiniatura) {
    miniaturaRuta = `${base}/miniatura.png`;
    await firmar(miniaturaRuta, null);
  }
  await prisma.archivo3d.update({
    where: { id: f.id },
    data: {
      placas: placas as unknown as Prisma.InputJsonValue,
      miniaturaRuta,
      actualizadoEn: new Date(),
      ...(l.hash && /^[0-9a-f]{64}$/.test(l.hash) ? { hash: l.hash } : {}),
    },
  });
  return { subidas };
}

/** Un archivo ya subido con el mismo contenido (sha256), para no subirlo dos veces. */
export async function archivoConHash(tenantId: string, hash: string) {
  if (!/^[0-9a-f]{64}$/.test(hash)) return null;
  return prisma.archivo3d.findFirst({ where: { tenantId, hash, subido: true }, select: { id: true, nombre: true } });
}
