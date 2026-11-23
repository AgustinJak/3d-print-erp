export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { liquidar } from "@/lib/reparto";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

/** POST /api/reparto/liquidar { desde } — cierra la semana (lunes) como pagada (docs/sdd/018). */
export async function POST(request: NextRequest) {
  try {
    const { tenantId, user } = await getAuthenticatedTenantNonDemo();
    if (tenantId !== "sendero3d") return NextResponse.json({ error: "Reparto es de Sendero 3D" }, { status: 403 });
    const b = (await request.json().catch(() => null)) as { desde?: unknown } | null;
    const r = await liquidar(b?.desde, user.email ?? null);
    return "error" in r ? NextResponse.json(r, { status: 400 }) : NextResponse.json(r);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
