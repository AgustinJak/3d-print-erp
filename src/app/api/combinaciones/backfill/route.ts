export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { prisma } from "@/lib/prisma";
import { completarCombinacionesDeLineas } from "@/lib/combinaciones";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

/**
 * Completa la combinación de las líneas de pedido que ya existían
 * (docs/sdd/001, spec 003). Idempotente. Con `?simular=1` sólo informa.
 */
export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const simular = request.nextUrl.searchParams.get("simular") === "1";
    return NextResponse.json({ simulado: simular, ...(await completarCombinacionesDeLineas(prisma, tenantId, { simular })) });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
