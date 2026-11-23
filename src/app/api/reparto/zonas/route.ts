export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { guardarTarifas } from "@/lib/reparto";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

/** PUT /api/reparto/zonas { cambios: [{ id, precio }] } — las tarifas del repartidor (docs/sdd/018). */
export async function PUT(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    if (tenantId !== "sendero3d") return NextResponse.json({ error: "Reparto es de Sendero 3D" }, { status: 403 });
    const b = (await request.json().catch(() => null)) as { cambios?: unknown } | null;
    const r = await guardarTarifas(b?.cambios);
    return "error" in r ? NextResponse.json(r, { status: 400 }) : NextResponse.json(r);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
