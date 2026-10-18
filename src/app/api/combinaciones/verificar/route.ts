export const dynamic = "force-dynamic";

import { verificarReparto } from "@/lib/reservas";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { NextResponse } from "next/server";

/**
 * Modo sombra del reparto (docs/sdd/001, spec 002): en cada línea de pedido
 * abierto, lo que reserva hoy contra lo que reservaría con su combinación.
 * Sólo lee. El reparto cambia de fuente recién con `distintas` vacío.
 */
export async function GET() {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    return NextResponse.json(await verificarReparto(tenantId));
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
