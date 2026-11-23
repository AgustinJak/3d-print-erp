export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { semanas } from "@/lib/reparto";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { NextResponse } from "next/server";

/** GET /api/reparto/semanas — lo entregado por semana, total, cuánto dejó y pagado (docs/sdd/018). */
export async function GET() {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    if (tenantId !== "sendero3d") return NextResponse.json({ error: "Reparto es de Sendero 3D" }, { status: 403 });
    return NextResponse.json({ semanas: await semanas() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
