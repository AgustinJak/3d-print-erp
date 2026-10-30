export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { resumenPromos } from "@/lib/promos-ml";
import { NextResponse } from "next/server";

/**
 * Promos de ML (docs/sdd/006, spec 010): las campañas, en qué promo está cada publicación, a
 * cuáles se puede sumar con lo que dejaría, y los avisos. Sobre la última lectura.
 */
export async function GET() {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    return NextResponse.json(await resumenPromos(tenantId));
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
