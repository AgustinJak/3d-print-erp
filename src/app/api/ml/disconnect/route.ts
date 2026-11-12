export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

/**
 * Desconecta una cuenta de Mercado Libre (borra los tokens guardados). Con `?cuenta=<id>`, otra
 * cuenta; sin nada, la principal, que sólo se desconecta si no quedan otras (docs/sdd/010): si no, lo
 * que va a la principal no tendría cuenta.
 */
export async function DELETE(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const cuenta = request.nextUrl.searchParams.get("cuenta");
    if (cuenta) {
      // Sus publicaciones quedarían yendo a la principal: primero hay que sacarlas del mapeo.
      const enlazadas = await prisma.mapeoCanal.count({ where: { tenantId, cuentaMlId: cuenta } });
      if (enlazadas) return NextResponse.json({ error: `Tiene ${enlazadas} publicaciones enlazadas en el ERP: no se puede desconectar.` }, { status: 409 });
      const r = await prisma.cuentaMercadolibre.deleteMany({ where: { id: cuenta, tenantId, principal: false } });
      if (!r.count) return NextResponse.json({ error: "No existe esa cuenta, o es la principal." }, { status: 404 });
      return NextResponse.json({ ok: true });
    }
    const otras = await prisma.cuentaMercadolibre.count({ where: { tenantId, principal: false } });
    if (otras) return NextResponse.json({ error: "Primero desconectá las otras cuentas." }, { status: 409 });
    await prisma.cuentaMercadolibre.deleteMany({ where: { tenantId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
