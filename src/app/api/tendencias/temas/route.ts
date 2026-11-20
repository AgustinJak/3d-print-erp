export const dynamic = "force-dynamic";

import { armarVista } from "@/lib/tendencias-vista";
import { crearTema } from "@/lib/tendencias-temas";
import { getAuthenticatedTenant, getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET  /api/tendencias/temas → los temas con sus señales, las búsquedas nuevas de ML y el calendario.
 * POST /api/tendencias/temas { nombre, tipo?, palabra? } → un tema nuevo (a mano o desde una búsqueda).
 * docs/sdd/016. Tendencias es de Sendero 3D: otro negocio ve la lista vacía.
 */
export async function GET() {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    if (tenantId !== "sendero3d") return NextResponse.json({ temas: [], nuevas: [], calendario: [], fotoMl: null, sync: null });
    return NextResponse.json(await armarVista());
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    if (tenantId !== "sendero3d") return NextResponse.json({ error: "Tendencias es de Sendero 3D" }, { status: 403 });
    const b = await request.json().catch(() => null);
    if (!b || typeof b !== "object") return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
    const r = await crearTema(b);
    return "error" in r ? NextResponse.json(r, { status: 400 }) : NextResponse.json(r, { status: 201 });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
