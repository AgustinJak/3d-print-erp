export const dynamic = "force-dynamic";

import { armarPropuesta } from "@/lib/precios-propuesta";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { NextResponse } from "next/server";

/**
 * La propuesta de precios (docs/sdd/003, spec 004): por combinación, el costo y los tres precios;
 * por clave de canal, lo publicado y lo propuesto; por producto, el precio de venta del ERP.
 * Los filtros los hace la pantalla.
 */
export async function GET() {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    return NextResponse.json(await armarPropuesta(tenantId));
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
