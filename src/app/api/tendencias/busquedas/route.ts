export const dynamic = "force-dynamic";

import { descartarBusqueda, volverBusqueda } from "@/lib/tendencias-temas";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/tendencias/busquedas { palabra, accion: "descartar" | "volver" } — una búsqueda de ML que
 * no es tema deja de aparecer en "Búsquedas nuevas" (o vuelve). docs/sdd/016.
 */
export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    if (tenantId !== "sendero3d") return NextResponse.json({ error: "Tendencias es de Sendero 3D" }, { status: 403 });
    const b = (await request.json().catch(() => null)) as { palabra?: unknown; accion?: unknown } | null;
    if (!b) return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
    const r =
      b.accion === "volver" ? await volverBusqueda(b.palabra) : b.accion === "descartar" ? await descartarBusqueda(b.palabra) : { error: "accion tiene que ser descartar o volver" };
    return "error" in r ? NextResponse.json(r, { status: 400 }) : NextResponse.json(r);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
