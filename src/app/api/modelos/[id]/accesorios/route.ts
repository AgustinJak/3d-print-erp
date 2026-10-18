export const dynamic = "force-dynamic";

import { agregarAccesorio } from "@/lib/recetas";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

/**
 * "Agregar accesorio" (docs/sdd/001, spec 006): crea "Con/Sin <nombre>", sus
 * combinaciones y, si viene `stockId`, la receta de "Con".
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const { id } = await params;
    const body: { nombre?: string; stockId?: string | null } = await request.json();
    const r = await agregarAccesorio(tenantId, id, body.nombre ?? "", body.stockId ?? null);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
