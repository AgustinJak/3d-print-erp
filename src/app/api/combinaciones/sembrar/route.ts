export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { sembrarCombinaciones } from "@/lib/combinaciones";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

/**
 * Siembra las combinaciones vendibles del catálogo (docs/sdd/001, spec 001).
 *
 * Idempotente: se puede correr cada vez que se agregan modelos o variantes, y
 * sólo crea lo que falta. Con `?simular=1` devuelve lo que haría sin escribir.
 */
export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const simular = request.nextUrl.searchParams.get("simular") === "1";
    const r = await sembrarCombinaciones(prisma, tenantId, { simular });
    return NextResponse.json({ simulado: simular, ...r });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
