export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { actualizarLiquidaciones, porCadaCuentaMl } from "@/lib/ml-lote";
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

    // Cada cuenta de ML del negocio (docs/sdd/010); los números se suman.
    const porCuenta = await porCadaCuentaMl(tenantId, () => actualizarLiquidaciones(tenantId, { max: parseInt(searchParams.get("max") || "40", 10) }));
    const hechas = porCuenta.map((x) => x.resultado).filter((x) => x.ok);
    const r = {
      ok: hechas.length > 0,
      candidatos: hechas.reduce((a, x) => a + x.candidatos, 0),
      stats: hechas.reduce(
        (a, x) => ({ revisados: a.revisados + x.stats.revisados, actualizados: a.actualizados + x.stats.actualizados, ya_resueltos: a.ya_resueltos + x.stats.ya_resueltos, no_encontrados: a.no_encontrados + x.stats.no_encontrados, errores: a.errores + x.stats.errores }),
        { revisados: 0, actualizados: 0, ya_resueltos: 0, no_encontrados: 0, errores: 0 }
      ),
      errores: hechas.flatMap((x) => x.errores),
    };

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
