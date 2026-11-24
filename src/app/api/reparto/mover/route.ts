export const dynamic = "force-dynamic";

import { moverPedidoWeb } from "@/lib/reparto";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

/** POST /api/reparto/mover { pedidoId, dia } — un pedido de la web a otro día de reparto (docs/sdd/018). */
export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    if (tenantId !== "sendero3d") return NextResponse.json({ error: "Reparto es de Sendero 3D" }, { status: 403 });
    const b = (await request.json().catch(() => null)) as { pedidoId?: unknown; dia?: unknown } | null;
    const r = await moverPedidoWeb(b?.pedidoId, b?.dia);
    return "error" in r ? NextResponse.json(r, { status: 400 }) : NextResponse.json(r);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
