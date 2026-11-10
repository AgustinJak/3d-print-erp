export const dynamic = "force-dynamic";

import { canalesDeModelos } from "@/lib/productos-canales";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextResponse } from "next/server";

/**
 * GET /api/modelos/canales — por producto, dónde está publicado y cómo está cada variante: lo que
 * usa Productos para filtrar, ordenar y elegir (ver `canalesDeModelos`).
 */
export async function GET() {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    return NextResponse.json(await canalesDeModelos(tenantId));
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
