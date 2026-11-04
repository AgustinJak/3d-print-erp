export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { sincronizarFacturacion } from "@/lib/facturacion-ml";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { NextResponse } from "next/server";

/**
 * Lee la facturación de ML ahora (docs/sdd/007). Sólo lectura de ML. Si responde `quedan`, se
 * terminó el tiempo de la función y hay que volver a llamarlo: ML deja 5 pedidos por minuto.
 */
export async function POST() {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    return NextResponse.json(await sincronizarFacturacion(tenantId, { presupuestoMs: 45_000 }));
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
