export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { armarDia } from "@/lib/reparto";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

/** GET /api/reparto/hoy?dia=AAAA-MM-DD — los Flex y la mensajería de la web de ese día (hoy si no viene), con zona y precio (docs/sdd/018). */
export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    if (tenantId !== "sendero3d") return NextResponse.json({ error: "Reparto es de Sendero 3D" }, { status: 403 });
    return NextResponse.json(await armarDia(request.nextUrl.searchParams.get("dia") ?? undefined), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
