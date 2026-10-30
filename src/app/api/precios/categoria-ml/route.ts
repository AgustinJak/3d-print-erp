export const dynamic = "force-dynamic";

import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { predecirCategorias } from "@/lib/categorias-ml";
import { NextRequest, NextResponse } from "next/server";

/**
 * Las categorías de ML que propone el predictor para un texto, con su comisión (docs/sdd/006,
 * spec 004, TASK-007). Sólo lee de ML. `?q=` el nombre del producto o lo que se busque.
 */
export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    if (q.length < 3) return NextResponse.json([]);
    return NextResponse.json(await predecirCategorias(tenantId, q));
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
