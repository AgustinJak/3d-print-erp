export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { actualizarLiquidaciones } from "@/lib/ml-lote";
import { NextRequest, NextResponse } from "next/server";

/**
 * Recorre los pedidos de Mercado Libre que todavía no tienen la liquidación
 * resuelta (o la tienen estimada) y les asigna fecha + estado según el envío.
 * Cubre los pedidos cargados a mano y los que quedaron fuera del back-fill.
 *
 * Re-ejecutable: los que ya tienen liquidación real se saltean sin llamar a ML.
 * La pasada vive en `lib/ml-lote` — la misma que corre por cron.
 *
 * POST /api/ml/actualizar-liquidaciones?max=80
 */
export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const { searchParams } = new URL(request.url);

    const r = await actualizarLiquidaciones(tenantId, {
      max: parseInt(searchParams.get("max") || "40", 10),
    });

    if (!r.ok) {
      return NextResponse.json(
        { error: "No hay cuenta de Mercado Libre conectada" },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, candidatos: r.candidatos, stats: r.stats, errores: r.errores });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
