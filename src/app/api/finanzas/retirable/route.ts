export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { actualizarShaySinPagar, calcularRetirable, leerSaldoMp } from "@/lib/retirable";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { NextResponse } from "next/server";

/**
 * Cuánto se puede retirar de Mercado Pago (docs/sdd/019).
 * GET  → la cuenta con el último saldo leído (rápido, no llama a Mercado Pago).
 * POST → lee el saldo del reporte de liberaciones (1 o 2 minutos) y recalcula lo de Shay sin pagar.
 */
export async function GET() {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    if (tenantId !== "sendero3d") return NextResponse.json({ error: "Es de Sendero 3D" }, { status: 403 });
    return NextResponse.json(await calcularRetirable(tenantId), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}

export async function POST() {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    if (tenantId !== "sendero3d") return NextResponse.json({ error: "Es de Sendero 3D" }, { status: 403 });
    const [saldo] = await Promise.all([leerSaldoMp(tenantId), actualizarShaySinPagar(tenantId)]);
    if ("error" in saldo) return NextResponse.json(saldo, { status: 502 });
    return NextResponse.json(await calcularRetirable(tenantId), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
