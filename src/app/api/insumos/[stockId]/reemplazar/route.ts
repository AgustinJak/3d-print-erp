export const dynamic = "force-dynamic";

import { reemplazarInsumo } from "@/lib/recetas";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

/**
 * PUT /api/insumos/[stockId]/reemplazar  { porStockId }
 *
 * Todas las recetas que usan este insumo pasan a usar otro (docs/sdd/004, spec 006, RN-2).
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ stockId: string }> }) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const { stockId } = await params;
    const body: { porStockId?: string } = await request.json().catch(() => ({}));
    if (!body.porStockId) return NextResponse.json({ error: "falta el insumo nuevo" }, { status: 400 });
    const r = await reemplazarInsumo(tenantId, stockId, body.porStockId);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
