export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { editarEnvio } from "@/lib/reparto";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

/** PATCH /api/reparto/envios/:id { zonaId?, precio?, quitar? } (docs/sdd/018). */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    if (tenantId !== "sendero3d") return NextResponse.json({ error: "Reparto es de Sendero 3D" }, { status: 403 });
    const { id } = await params;
    const b = await request.json().catch(() => null);
    if (!b || typeof b !== "object") return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
    const r = await editarEnvio(id, b);
    return "error" in r ? NextResponse.json(r, { status: 400 }) : NextResponse.json(r);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
