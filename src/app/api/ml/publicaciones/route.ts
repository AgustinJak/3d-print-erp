export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { normalizeForMatch } from "@/lib/webhook-security";
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
        include: { modelo: { select: { id: true, nombre: true } } },
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
    const data: { modeloId?: string | null; ignorar?: boolean } = {};
    if ("modeloId" in body) {
      data.modeloId = body.modeloId || null;
      if (body.modeloId) data.ignorar = false; // asignar modelo cancela el ignorar
    }
    if ("ignorar" in body) {
      data.ignorar = Boolean(body.ignorar);
      if (body.ignorar) data.modeloId = null; // ignorar limpia el modelo
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
