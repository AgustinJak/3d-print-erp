export const dynamic = "force-dynamic";

import { crearEvento } from "@/lib/tendencias-temas";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

/** POST /api/tendencias/eventos { titulo, tipo, fecha, fechaFin?, temaId?, anual? } — un evento a mano. docs/sdd/016. */
export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    if (tenantId !== "sendero3d") return NextResponse.json({ error: "Tendencias es de Sendero 3D" }, { status: 403 });
    const b = await request.json().catch(() => null);
    if (!b || typeof b !== "object") return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
    const r = await crearEvento(b);
    return "error" in r ? NextResponse.json(r, { status: 400 }) : NextResponse.json(r, { status: 201 });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
