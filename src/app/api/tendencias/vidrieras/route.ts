export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { guardarVidrieras, opcionesDeVidrieras } from "@/lib/tendencias-descubrir";
import { getAuthenticatedTenant, getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/tendencias/vidrieras → las subcategorías de ML para elegir, con las elegidas marcadas.
 * PUT /api/tendencias/vidrieras { ids } → las categorías que mira "Descubrir". docs/sdd/016.
 */
export async function GET() {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    if (tenantId !== "sendero3d") return NextResponse.json({ opciones: [] });
    return NextResponse.json({ opciones: await opcionesDeVidrieras() });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    if (tenantId !== "sendero3d") return NextResponse.json({ error: "Tendencias es de Sendero 3D" }, { status: 403 });
    const b = (await request.json().catch(() => null)) as { ids?: unknown } | null;
    const r = await guardarVidrieras(b?.ids);
    return "error" in r ? NextResponse.json(r, { status: 400 }) : NextResponse.json(r);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
