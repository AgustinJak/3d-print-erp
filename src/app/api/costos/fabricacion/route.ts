export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { guardarMaterial, guardarTaller, leerCostosDeFabricacion } from "@/lib/costos-de-fabricacion";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

/**
 * Cuánto cuesta fabricar (desde el 2026-11-18, antes en la Configuración de la Bodega).
 *
 *   GET                         → parámetros del taller y materiales con su precio por kilo
 *   PUT   { precioKwh, ... }    → los parámetros del taller que vengan
 *   POST  { id?, nombre, precioKg, porDefecto?, activo? } → crea o cambia un material
 *
 * Guardar recalcula el costo de los productos; no publica precios.
 */
export async function GET() {
  try {
    await getAuthenticatedTenantNonDemo();
    return NextResponse.json(await leerCostosDeFabricacion());
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}

async function cuerpo(request: NextRequest): Promise<Record<string, unknown> | null> {
  const b = await request.json().catch(() => null);
  return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : null;
}

export async function PUT(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const b = await cuerpo(request);
    if (!b) return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
    const r = await guardarTaller(tenantId, b);
    return "error" in r ? NextResponse.json(r, { status: 400 }) : NextResponse.json(r);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const b = await cuerpo(request);
    if (!b) return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
    const r = await guardarMaterial(tenantId, b);
    return "error" in r ? NextResponse.json(r, { status: 400 }) : NextResponse.json(r);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
