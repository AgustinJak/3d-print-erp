export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { sincronizarOrdenes } from "@/lib/ml-lote";
import { NextRequest, NextResponse } from "next/server";

/**
 * Trae las órdenes de los últimos N días desde Mercado Libre y las inserta.
 * Idempotente: las órdenes ya cargadas se saltean, así que es seguro
 * re-ejecutar (si se corta por timeout, volver a llamar continúa donde quedó).
 *
 * La pasada en sí vive en `lib/ml-lote` porque el cron corre exactamente la
 * misma. Acá sólo se resuelve quién la pidió.
 *
 * POST /api/ml/backfill?days=30
 */
export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const { searchParams } = new URL(request.url);

    const r = await sincronizarOrdenes(tenantId, {
      days: parseInt(searchParams.get("days") || "30", 10),
      max: parseInt(searchParams.get("max") || "200", 10),
    });

    if (!r.ok) {
      return NextResponse.json(
        { error: "No hay cuenta de Mercado Libre conectada" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      total_ordenes_ml: r.totalOrdenesMl,
      total_compras: r.stats.compras,
      stats: r.stats,
      errores: r.errores,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
