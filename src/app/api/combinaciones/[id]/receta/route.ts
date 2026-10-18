export const dynamic = "force-dynamic";

import { guardarReceta, recetaDeCombinacion } from "@/lib/recetas";
import { getAuthenticatedTenant, getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

/** Qué consume una combinación: la pieza y sus insumos (docs/sdd/001, spec 006). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const { id } = await params;
    const r = await recetaDeCombinacion(tenantId, id);
    if (!r) return NextResponse.json({ error: "combinación no encontrada" }, { status: 404 });
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}

/** Reemplaza los insumos de la combinación y reparte el stock de nuevo. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const { id } = await params;
    const body: { insumos?: Array<{ stockId: string; cantidad?: number }> } = await request.json();
    const insumos = (body.insumos ?? []).map((i) => ({ stockId: i.stockId, cantidad: i.cantidad ?? 1 }));
    const r = await guardarReceta(tenantId, id, insumos);
    return NextResponse.json({ ok: true, ...r, receta: await recetaDeCombinacion(tenantId, id) });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
