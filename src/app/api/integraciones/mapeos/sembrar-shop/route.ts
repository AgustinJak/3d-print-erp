export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { sembrarMapeosShop } from "@/lib/sembrar-shop";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

/**
 * Siembra el mapeo del Shop desde su catálogo (docs/sdd/001, spec 004, REQ-7): una
 * clave por producto y combinación de opciones, así un producto nuevo de la web
 * aparece en Integraciones › Mapeo antes de su primera venta. Lee el catálogo con
 * la clave publicable del Shop, sin escribir nada allá. Idempotente.
 *
 * `?simular=1` dice qué haría sin escribir.
 */
export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const simular = request.nextUrl.searchParams.get("simular") === "1";
    const r = await sembrarMapeosShop(tenantId, { simular });
    return NextResponse.json({ simulado: simular, ...r });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
