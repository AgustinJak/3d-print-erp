export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { porCadaCuentaMl, sincronizarOrdenes } from "@/lib/ml-lote";
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

    // Cada cuenta de ML del negocio (docs/sdd/010); los números se suman.
    const porCuenta = await porCadaCuentaMl(tenantId, () =>
      sincronizarOrdenes(tenantId, {
        days: parseInt(searchParams.get("days") || "30", 10),
        max: parseInt(searchParams.get("max") || "200", 10),
      })
    );
    const hechas = porCuenta.map((x) => x.resultado).filter((x) => x.ok);
    const r = {
      ok: hechas.length > 0,
      totalOrdenesMl: hechas.reduce((a, x) => a + x.totalOrdenesMl, 0),
      stats: hechas.reduce(
        (a, x) => ({ compras: a.compras + x.stats.compras, creadas: a.creadas + x.stats.creadas, actualizadas: a.actualizadas + x.stats.actualizadas, ya_existian: a.ya_existian + x.stats.ya_existian, ignoradas: a.ignoradas + x.stats.ignoradas, errores: a.errores + x.stats.errores }),
        { compras: 0, creadas: 0, actualizadas: 0, ya_existian: 0, ignoradas: 0, errores: 0 }
      ),
      errores: hechas.flatMap((x) => x.errores),
    };

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
