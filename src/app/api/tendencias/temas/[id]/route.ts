export const dynamic = "force-dynamic";

import { editarTema, fichaDeTema } from "@/lib/tendencias-temas";
import { getAuthenticatedTenant, getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET   /api/tendencias/temas/:id → la ficha: productos y ventas, búsquedas de ML, eventos.
 * PATCH /api/tendencias/temas/:id { nombre?, tipo?, alias?, sumarAlias?, activo?, unirCon? }
 * docs/sdd/016.
 */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const { id } = await params;
    const f = tenantId === "sendero3d" ? await fichaDeTema(id) : null;
    return f ? NextResponse.json(f) : NextResponse.json({ error: "No existe ese tema" }, { status: 404 });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    if (tenantId !== "sendero3d") return NextResponse.json({ error: "Tendencias es de Sendero 3D" }, { status: 403 });
    const { id } = await params;
    const b = await request.json().catch(() => null);
    if (!b || typeof b !== "object") return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
    const r = await editarTema(id, b);
    return "error" in r ? NextResponse.json(r, { status: 400 }) : NextResponse.json(r);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
