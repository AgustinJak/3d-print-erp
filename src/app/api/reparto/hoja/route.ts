export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { mandarHoja } from "@/lib/reparto";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/reparto/hoja { elegidos } — guarda la hoja de hoy y devuelve el link para el repartidor.
 * El link nuevo reemplaza al anterior: sólo se guarda su hash (docs/sdd/018).
 */
export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    if (tenantId !== "sendero3d") return NextResponse.json({ error: "Reparto es de Sendero 3D" }, { status: 403 });
    const b = (await request.json().catch(() => null)) as { elegidos?: unknown } | null;
    if (!b || !Array.isArray(b.elegidos)) return NextResponse.json({ error: "Faltan los envíos" }, { status: 400 });
    const r = await mandarHoja(b.elegidos as Parameters<typeof mandarHoja>[0]);
    if ("error" in r) return NextResponse.json(r, { status: 400 });
    return NextResponse.json({ link: `${request.nextUrl.origin}/r/${r.token}`, vence: r.vence, envios: r.envios }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
