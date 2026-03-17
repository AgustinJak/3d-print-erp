export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextResponse } from "next/server";
import {
  fetchUpcomingMovies,
  fetchUpcomingSeries,
  tmdbMovieToEvento,
  tmdbSeriesToEvento,
} from "@/lib/tmdb";
import { fetchUpcomingAnime, anilistAnimeToEvento } from "@/lib/anilist";

interface SyncResult {
  fuente: string;
  total: number;
  creados: number;
  actualizados: number;
  errores: number;
}

interface EventoData {
  titulo: string;
  tipo: string;
  fecha: Date;
  descripcion: string | null;
  imagenUrl: string | null;
  nivelViral: string;
  fuente: string;
  fuenteId: string;
  sugerencias: Array<{
    nombre: string;
    tipoProducto: string;
    potencialVenta: number;
    dificultad: string;
    ventanaInicio: string;
  }>;
}

/**
 * Batch upsert eventos using a single transaction for speed.
 */
async function batchUpsertEventos(
  tenantId: string,
  eventos: EventoData[]
): Promise<{ creados: number; actualizados: number; errores: number }> {
  let creados = 0;
  let actualizados = 0;
  let errores = 0;

  // Process in a single transaction for speed
  await prisma.$transaction(
    async (tx) => {
      for (const evento of eventos) {
        try {
          const { sugerencias, ...eventoData } = evento;

          const existing = await tx.eventoTendencia.findUnique({
            where: {
              tenantId_fuente_fuenteId: {
                tenantId,
                fuente: eventoData.fuente,
                fuenteId: eventoData.fuenteId,
              },
            },
          });

          if (existing) {
            await tx.eventoTendencia.update({
              where: { id: existing.id },
              data: {
                titulo: eventoData.titulo,
                tipo: eventoData.tipo,
                fecha: eventoData.fecha,
                descripcion: eventoData.descripcion,
                imagenUrl: eventoData.imagenUrl,
                nivelViral: eventoData.nivelViral,
                activo: true,
              },
            });
            actualizados++;
          } else {
            await tx.eventoTendencia.create({
              data: {
                tenantId,
                ...eventoData,
                sugerencias: {
                  create: sugerencias,
                },
              },
            });
            creados++;
          }
        } catch (err) {
          console.error(`Error upserting evento ${evento.fuenteId}:`, err);
          errores++;
        }
      }
    },
    { timeout: 60000 } // 60s timeout for the batch
  );

  return { creados, actualizados, errores };
}

export async function POST() {
  try {
    const { tenantId } = await getAuthenticatedTenant();

    const results: SyncResult[] = [];
    const warnings: string[] = [];

    // ==================== Fetch all data in parallel ====================
    const hasTmdbKey = !!process.env.TMDB_API_KEY;

    const [moviesRaw, seriesRaw, animeRaw] = await Promise.all([
      hasTmdbKey
        ? fetchUpcomingMovies().catch((err) => {
            warnings.push(`Error al obtener películas de TMDB: ${err instanceof Error ? err.message : String(err)}`);
            return [];
          })
        : Promise.resolve([]),
      hasTmdbKey
        ? fetchUpcomingSeries().catch((err) => {
            warnings.push(`Error al obtener series de TMDB: ${err instanceof Error ? err.message : String(err)}`);
            return [];
          })
        : Promise.resolve([]),
      fetchUpcomingAnime().catch((err) => {
        warnings.push(`Error al obtener anime de AniList: ${err instanceof Error ? err.message : String(err)}`);
        return [];
      }),
    ]);

    if (!hasTmdbKey) {
      warnings.push("TMDB_API_KEY no configurada — se omitió la sincronización de películas y series");
    }

    // ==================== Convert to EventoData ====================
    const movieEventos = moviesRaw.map(tmdbMovieToEvento);
    const seriesEventos = seriesRaw.map(tmdbSeriesToEvento);
    const animeEventos = animeRaw.map(anilistAnimeToEvento);

    // All eventos in a single batch
    const allEventos = [...movieEventos, ...seriesEventos, ...animeEventos];

    console.log(
      `[Sync] Fetched: ${movieEventos.length} películas, ${seriesEventos.length} series, ${animeEventos.length} anime = ${allEventos.length} total`
    );

    // ==================== Batch upsert ====================
    const batchResult = await batchUpsertEventos(tenantId, allEventos);

    results.push({
      fuente: "tmdb-peliculas",
      total: movieEventos.length,
      creados: 0,
      actualizados: 0,
      errores: 0,
    });
    results.push({
      fuente: "tmdb-series",
      total: seriesEventos.length,
      creados: 0,
      actualizados: 0,
      errores: 0,
    });
    results.push({
      fuente: "anilist-anime",
      total: animeEventos.length,
      creados: 0,
      actualizados: 0,
      errores: 0,
    });

    return NextResponse.json({
      message: `Sincronización completada: ${batchResult.creados} creados, ${batchResult.actualizados} actualizados, ${batchResult.errores} errores`,
      resultados: results,
      totales: batchResult,
      ...(warnings.length > 0 ? { advertencias: warnings } : {}),
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    console.error("Error en sincronización de tendencias:", e);
    return NextResponse.json(
      { error: "Error interno al sincronizar tendencias" },
      { status: 500 }
    );
  }
}
