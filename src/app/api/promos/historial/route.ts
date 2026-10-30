export const dynamic = "force-dynamic";

import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { historialPromos } from "@/lib/promos-ml";
import { NextResponse } from "next/server";

/** Cada promo que se prendió, cambió o sacó desde el ERP (spec 010, REQ-7). */
export async function GET() {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    return NextResponse.json(await historialPromos(tenantId));
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
