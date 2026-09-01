export const dynamic = "force-dynamic";

import { costoModelo, costoVariante } from "@/lib/costos";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { normalizeForMatch } from "@/lib/webhook-security";
import { sugerirVariantesImplicitas, costoDeVariantes } from "@/lib/ml-variantes-implicitas";
import { NextRequest, NextResponse } from "next/server";

/* ───────────────────────── Similitud de título ───────────────────────── */

// Palabras genéricas que no aportan al match (ruido de títulos de ML)
const STOPWORDS = new Set([
  "de", "del", "la", "el", "los", "las", "y", "con", "sin", "para", "por",
  "un", "una", "x", "kit", "set", "modelo", "3d", "cm", "mm", "premium",
  "completo", "minikatana", "katana", "daga", "espada", "figura", "sendero",
]);

function tokenize(s: string): Set<string> {
  return new Set(
    normalizeForMatch(s)
      .split(" ")
      .filter((t) => t.length >= 3 && !STOPWORDS.has(t))
  );
}

/** Score de similitud 0..1 entre dos conjuntos de tokens (Jaccard). */
function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/* ───────────────────────── GET: lista + sugerencias ───────────────────────── */

export async function GET() {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();

    const [publicaciones, modelos] = await Promise.all([
      prisma.publicacionMl.findMany({
        where: { tenantId },
        orderBy: [{ ignorar: "asc" }, { modeloId: "asc" }, { vecesVista: "desc" }],
        include: {
          modelo: {
            select: {
              id: true,
              nombre: true,
              costoFab: true,
              costoInsumos: true,
              variantes: { select: { id: true, nombre: true, costoFabAdicional: true, costoInsumosAdicional: true } },
            },
          },
        },
      }),
      prisma.modelo.findMany({
        where: { tenantId, activo: true, consolidadoEnId: null },
        select: { id: true, nombre: true, serie: true },
        orderBy: { nombre: "asc" },
      }),
    ]);

    // Pre-tokenizar modelos una vez
    const modelosTok = modelos.map((m) => ({
      ...m,
      tokens: tokenize(`${m.nombre} ${m.serie || ""}`),
    }));

    const conSugerencia = publicaciones.map((p) => {
      let sugerencia: { id: string; nombre: string; score: number } | null = null;
      if (!p.modeloId && !p.ignorar && p.titulo) {
        const tTok = tokenize(p.titulo);
        let best = { id: "", nombre: "", score: 0 };
        for (const m of modelosTok) {
          const score = similarity(tTok, m.tokens);
          if (score > best.score) best = { id: m.id, nombre: m.nombre, score };
        }
        if (best.score > 0) sugerencia = best;
      }
      // Variantes que esta publicación lleva SIEMPRE (el "95cm" y el "Con Funda"
      // del título, que ML no manda como variación). Ver ml-variantes-implicitas.
      const variantes = p.modelo?.variantes ?? [];
      const sugeridas = p.modeloId ? sugerirVariantesImplicitas(p.titulo, variantes) : [];
      const costoBase = p.modelo ? costoModelo(p.modelo) : 0;

      return {
        id: p.id,
        mla: p.mla,
        titulo: p.titulo,
        modeloId: p.modeloId,
        modeloNombre: p.modelo?.nombre ?? null,
        ignorar: p.ignorar,
        vecesVista: p.vecesVista,
        ultimoPedido: p.ultimoMla,
        sugerencia,
        variantesDisponibles: variantes,
        variantesImplicitas: p.variantesImplicitas,
        sugerenciaVariantes: sugeridas,
        costoBase,
        costoConImplicitas: costoBase + costoDeVariantes(p.variantesImplicitas, variantes),
        costoSiAplicaSugerencia: costoBase + costoDeVariantes(sugeridas, variantes),
      };
    });

    const sinMapear = conSugerencia.filter((p) => !p.modeloId && !p.ignorar);
    const mapeadas = conSugerencia.filter((p) => p.modeloId);
    const ignoradas = conSugerencia.filter((p) => p.ignorar && !p.modeloId);

    return NextResponse.json({
      sinMapear,
      mapeadas,
      ignoradas,
      modelos,
      stats: {
        sinMapear: sinMapear.length,
        mapeadas: mapeadas.length,
        ignoradas: ignoradas.length,
      },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}


/* ────────────── POST: aplicar sugerencias de variantes en lote ────────────── */

/**
 * Completa `variantesImplicitas` en todas las publicaciones mapeadas que todavía
 * no las tengan, usando la sugerencia leída del título.
 *
 * Con `soloPreview: true` no escribe nada: devuelve qué haría. Útil para
 * revisar antes de confirmar.
 */
export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const body = await request.json().catch(() => ({}));
    const soloPreview = Boolean(body.soloPreview);
    const sobrescribir = Boolean(body.sobrescribir); // también las ya configuradas

    const publicaciones = await prisma.publicacionMl.findMany({
      where: { tenantId, ignorar: false, modeloId: { not: null } },
      include: {
        modelo: {
          select: {
            id: true,
            nombre: true,
            costoFab: true,
            costoInsumos: true,
            variantes: { select: { id: true, nombre: true, costoFabAdicional: true, costoInsumosAdicional: true } },
          },
        },
      },
    });

    const cambios: Array<{
      mla: string;
      titulo: string | null;
      modelo: string;
      variantes: string[];
      costoAntes: number;
      costoDespues: number;
    }> = [];

    for (const p of publicaciones) {
      if (!p.modelo) continue;
      if (p.variantesImplicitas.length > 0 && !sobrescribir) continue;

      const ids = sugerirVariantesImplicitas(p.titulo, p.modelo.variantes);
      if (ids.length === 0) continue;

      const nombres = ids
        .map((id) => p.modelo!.variantes.find((v) => v.id === id)?.nombre)
        .filter((n): n is string => Boolean(n));

      cambios.push({
        mla: p.mla,
        titulo: p.titulo,
        modelo: p.modelo.nombre,
        variantes: nombres,
        costoAntes: costoModelo(p.modelo) + costoDeVariantes(p.variantesImplicitas, p.modelo.variantes),
        costoDespues: costoModelo(p.modelo) + costoDeVariantes(ids, p.modelo.variantes),
      });

      if (!soloPreview) {
        await prisma.publicacionMl.update({
          where: { tenantId_mla: { tenantId, mla: p.mla } },
          data: { variantesImplicitas: ids },
        });
      }
    }

    return NextResponse.json({
      ok: true,
      aplicadas: soloPreview ? 0 : cambios.length,
      cambios,
      soloPreview,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/* ───────────────────────── PATCH: asignar / ignorar ───────────────────────── */

export async function PATCH(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const body = await request.json();
    const mla: string | undefined = body.mla;
    if (!mla) {
      return NextResponse.json({ error: "mla requerido" }, { status: 400 });
    }

    // Acción: asignar modelo, o marcar/desmarcar ignorar
    const data: { modeloId?: string | null; ignorar?: boolean; variantesImplicitas?: string[] } = {};
    if ("modeloId" in body) {
      data.modeloId = body.modeloId || null;
      if (body.modeloId) data.ignorar = false; // asignar modelo cancela el ignorar
    }
    if ("ignorar" in body) {
      data.ignorar = Boolean(body.ignorar);
      if (body.ignorar) data.modeloId = null; // ignorar limpia el modelo
    }

    if ("variantesImplicitas" in body) {
      const ids: string[] = Array.isArray(body.variantesImplicitas)
        ? body.variantesImplicitas.filter((x: unknown): x is string => typeof x === "string")
        : [];
      // Sólo se aceptan variantes que pertenezcan al modelo de esta publicación
      const pub = await prisma.publicacionMl.findUnique({
        where: { tenantId_mla: { tenantId, mla } },
        select: { modeloId: true },
      });
      const modeloId = ("modeloId" in body ? body.modeloId : pub?.modeloId) || null;
      if (ids.length && modeloId) {
        const validas = await prisma.varianteModelo.findMany({
          where: { modeloId, id: { in: ids } },
          select: { id: true },
        });
        data.variantesImplicitas = validas.map((v) => v.id);
      } else {
        data.variantesImplicitas = [];
      }
    }

    // Cambiar de modelo invalida las variantes implícitas del modelo anterior
    if ("modeloId" in body && !("variantesImplicitas" in body)) {
      data.variantesImplicitas = [];
    }

    // Validar que el modelo pertenezca al tenant
    if (data.modeloId) {
      const modelo = await prisma.modelo.findFirst({
        where: { tenantId, id: data.modeloId },
        select: { id: true },
      });
      if (!modelo) {
        return NextResponse.json({ error: "modelo no encontrado" }, { status: 400 });
      }
    }

    const updated = await prisma.publicacionMl.update({
      where: { tenantId_mla: { tenantId, mla } },
      data,
    });

    return NextResponse.json({ ok: true, publicacion: updated });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
