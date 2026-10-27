export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { resumenPublicidad } from "@/lib/publicidad-ml";
import { esPeriodo, rangoDe } from "@/lib/publicidad-reglas";
import { NextRequest, NextResponse } from "next/server";

/**
 * Publicidad de ML (docs/sdd/005, spec 001): campañas y anuncios del período, con lo que deja
 * cada uno según el costo del ERP. `?periodo=7d|30d|mes|mes-pasado` (30 días si no viene).
 */
export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const p = request.nextUrl.searchParams.get("periodo");
    return NextResponse.json(await resumenPublicidad(tenantId, rangoDe(esPeriodo(p) ? p : "30d")));
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
