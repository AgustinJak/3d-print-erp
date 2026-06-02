export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { NextResponse } from "next/server";

/** Desconecta la cuenta de Mercado Libre (borra los tokens guardados). */
export async function DELETE() {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    await prisma.cuentaMercadolibre.deleteMany({ where: { tenantId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
