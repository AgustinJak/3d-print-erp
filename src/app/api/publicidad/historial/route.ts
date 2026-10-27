export const dynamic = "force-dynamic";

import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { historialPublicidad } from "@/lib/publicidad-ml";
import { NextResponse } from "next/server";

/** Los últimos 200 cambios de Product Ads, de la pantalla y de Claude (docs/sdd/005, spec 002). */
export async function GET() {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    return NextResponse.json(await historialPublicidad(tenantId));
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
