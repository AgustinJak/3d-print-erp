import { prisma } from "@/lib/prisma";
import { fechaDeEstrenoAr, fetchUpcomingMovies, fetchUpcomingSeries, tmdbMovieToEvento, tmdbSeriesToEvento } from "@/lib/tmdb";
import { anilistAnimeToEvento, fetchUpcomingAnime } from "@/lib/anilist";
import { temaDeTexto } from "@/lib/temas";

/**
 * El calendario de Tendencias (docs/sdd/016, spec 003).
 *
 * Trae los estrenos de TMDB y las temporadas de AniList como hasta ahora, pero:
 * - sin "viralidad" ni sugerencias de plantilla (RN-2);
 * - con el estreno en Argentina de cada película (RN-5);
 * - vinculando cada evento a un tema si su título coincide con un alias;
 * - y archivando lo que pasó hace más de 7 días (RN-4).
 *
 * Las fechas comerciales no se guardan: salen de `fechas-comerciales.ts`. Las filas de 2026 que se
 * sembraban a mano (fuente `calendario_ar`) se archivan.
 */

const TENANT = "sendero3d";
/** Como mucho, tantas consultas de estreno en Argentina por vuelta. */
const MAX_FECHAS_AR = 40;

interface EventoNuevo {
  titulo: string;
  /** Otros títulos para buscar el tema (el romaji de un anime). */
  otros: string[];
  tipo: string;
  fecha: Date;
  descripcion: string | null;
  imagenUrl: string | null;
  fuente: string;
  fuenteId: string;
  tmdbId?: number;
}

export interface ResultadoDeCalendario {
  fuentes: Record<string, { traidos: number; error: string | null }>;
  guardados: number;
  fechasAr: number;
  vinculados: number;
  archivados: number;
}

async function traer<T>(nombre: string, fuentes: ResultadoDeCalendario["fuentes"], fn: () => Promise<T[]>): Promise<T[]> {
  try {
    const r = await fn();
    fuentes[nombre] = { traidos: r.length, error: null };
    return r;
  } catch (e) {
    fuentes[nombre] = { traidos: 0, error: e instanceof Error ? e.message.slice(0, 200) : String(e) };
    return [];
  }
}

export async function sincronizarCalendario(): Promise<ResultadoDeCalendario> {
  const fuentes: ResultadoDeCalendario["fuentes"] = {};
  const [peliculas, series, animes] = await Promise.all([
    traer("películas", fuentes, fetchUpcomingMovies),
    traer("series", fuentes, fetchUpcomingSeries),
    traer("animes", fuentes, fetchUpcomingAnime),
  ]);

  const eventos: EventoNuevo[] = [
    ...peliculas.map((m) => ({ ...elegir(tmdbMovieToEvento(m)), otros: [], tmdbId: m.id })),
    ...series.map((s) => ({ ...elegir(tmdbSeriesToEvento(s)), otros: [] })),
    ...animes.map((a) => ({ ...elegir(anilistAnimeToEvento(a)), otros: [a.title.romaji, a.title.english].filter((x): x is string => !!x) })),
  ];

  const temas = await prisma.tema.findMany({ where: { tenantId: TENANT, activo: true }, select: { id: true, alias: true } });
  const temaDe = (e: { titulo: string; otros: string[] }) =>
    temaDeTexto(e.titulo, temas)?.id ?? e.otros.map((o) => temaDeTexto(o, temas)?.id).find(Boolean) ?? null;

  let guardados = 0;
  for (const e of eventos) {
    const temaId = temaDe(e);
    await prisma.eventoTendencia.upsert({
      where: { tenantId_fuente_fuenteId: { tenantId: TENANT, fuente: e.fuente, fuenteId: e.fuenteId } },
      create: { tenantId: TENANT, titulo: e.titulo, tipo: e.tipo, fecha: e.fecha, descripcion: e.descripcion, imagenUrl: e.imagenUrl, fuente: e.fuente, fuenteId: e.fuenteId, temaId },
      // El tema no se toca: uno elegido a mano no se pisa, y si falta lo completa la vuelta de abajo.
      update: { titulo: e.titulo, tipo: e.tipo, fecha: e.fecha, descripcion: e.descripcion, imagenUrl: e.imagenUrl, activo: true, archivado: false },
    });
    guardados++;
  }

  // Vincular los que quedaron sin tema (los viejos y los nuevos).
  let vinculados = 0;
  const sinTema = await prisma.eventoTendencia.findMany({ where: { tenantId: TENANT, temaId: null, archivado: false }, select: { id: true, titulo: true, fuenteId: true } });
  const otrosDe = new Map(eventos.map((e) => [e.fuenteId, e.otros]));
  for (const e of sinTema) {
    const temaId = temaDe({ titulo: e.titulo, otros: (e.fuenteId && otrosDe.get(e.fuenteId)) || [] });
    if (!temaId) continue;
    await prisma.eventoTendencia.update({ where: { id: e.id }, data: { temaId } });
    vinculados++;
  }

  // Estreno en Argentina: las películas de los próximos 120 días sin fecha AR, o las de los
  // próximos 30 (la fecha se corre a último momento). Con tope por vuelta.
  let fechasAr = 0;
  const ahora = new Date();
  const en = (dias: number) => new Date(ahora.getTime() + dias * 24 * 60 * 60 * 1000);
  const candidatas = await prisma.eventoTendencia.findMany({
    where: {
      tenantId: TENANT,
      fuente: "tmdb",
      tipo: "pelicula",
      archivado: false,
      fecha: { gte: en(-30), lte: en(120) },
      OR: [{ fechaAr: null }, { fechaAr: { lte: en(30) } }],
    },
    select: { id: true, fuenteId: true },
    orderBy: { fecha: "asc" },
    take: MAX_FECHAS_AR,
  });
  for (const c of candidatas) {
    const id = Number(c.fuenteId?.replace("tmdb-movie-", ""));
    if (!Number.isFinite(id)) continue;
    try {
      const f = await fechaDeEstrenoAr(id);
      if (f) {
        await prisma.eventoTendencia.update({ where: { id: c.id }, data: { fechaAr: f } });
        fechasAr++;
      }
    } catch (e) {
      console.error("[tendencias-calendario] estreno AR", c.fuenteId, e instanceof Error ? e.message : e);
    }
  }

  // Archivo: lo que pasó hace más de 7 días, y las fechas comerciales sembradas a mano.
  const archivados = await prisma.$executeRaw`
    UPDATE public.eventos_tendencia SET archivado = true
     WHERE tenant_id = ${TENANT} AND NOT archivado AND (
           fuente = 'calendario_ar'
        OR (NOT anual AND COALESCE(fecha_fin, fecha_ar, fecha) < now() - interval '7 days'))`;

  return { fuentes, guardados, fechasAr, vinculados, archivados };
}

/** Sólo los campos que se guardan: la viralidad y las sugerencias quedan afuera (RN-2). */
function elegir(e: { titulo: string; tipo: string; fecha: Date; descripcion: string | null; imagenUrl: string | null; fuente: string; fuenteId: string }) {
  return { titulo: e.titulo, tipo: e.tipo, fecha: e.fecha, descripcion: e.descripcion, imagenUrl: e.imagenUrl, fuente: e.fuente, fuenteId: e.fuenteId };
}
