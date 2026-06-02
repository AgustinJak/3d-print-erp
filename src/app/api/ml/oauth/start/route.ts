export const dynamic = "force-dynamic";

import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { buildAuthorizationUrl } from "@/lib/mercadolibre";
import { NextResponse } from "next/server";

/**
 * Inicia el flujo OAuth: redirige al usuario a Mercado Libre para autorizar.
 * Requiere usuario autenticado (no demo). El tenant se firma en el `state`.
 */
export async function GET() {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const url = buildAuthorizationUrl(tenantId);
    return NextResponse.redirect(url);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
