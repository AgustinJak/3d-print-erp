export const dynamic = "force-dynamic";

import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { buildAuthorizationUrl } from "@/lib/mercadolibre";
import { NextRequest, NextResponse } from "next/server";

/**
 * Inicia el flujo OAuth: redirige al usuario a Mercado Libre para autorizar.
 * Requiere usuario autenticado (no demo). El tenant se firma en el `state`. Con `?otra=1` se conecta
 * otra cuenta además de la principal (docs/sdd/010).
 */
export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const url = buildAuthorizationUrl(tenantId, request.nextUrl.searchParams.get("otra") === "1" ? "otra" : "principal");
    return NextResponse.redirect(url);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
