export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { leerPromos } from "@/lib/promos-ml";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/**
 * "Leer promos de ML" (spec 010, REQ-1): una tanda de publicaciones leídas antes de `desde`, las
 * más viejas primero. La pantalla repite hasta que `faltan` es 0. Sólo GET a ML.
 */
const Cuerpo = z.object({ desde: z.string().datetime(), limite: z.number().int().min(1).max(80).optional() });
const TANDA = 60;

export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const cuerpo = Cuerpo.safeParse(await request.json().catch(() => null));
    if (!cuerpo.success) return NextResponse.json({ error: "pedido inválido" }, { status: 400 });
    return NextResponse.json(await leerPromos(tenantId, { desde: new Date(cuerpo.data.desde), limite: cuerpo.data.limite ?? TANDA }));
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
