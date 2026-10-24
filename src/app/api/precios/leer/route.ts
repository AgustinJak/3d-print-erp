export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { leerPreciosMl } from "@/lib/precios-ml";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

/**
 * Lee los precios publicados de un canal y los guarda en el mapeo (spec 004, RN-2). Sólo lee.
 *
 *   POST ?canal=mercadolibre   → GET /items, /prices y /sale_price de cada publicación mapeada
 *   POST ?canal=shop           → 501 hasta que el Shop tenga el endpoint de la spec 006
 */
export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const canal = request.nextUrl.searchParams.get("canal");
    if (canal === "shop") {
      return NextResponse.json({ error: "la web se lee con el endpoint de precios del Shop, que todavía no está (spec 006)" }, { status: 501 });
    }
    if (canal !== "mercadolibre") return NextResponse.json({ error: "canal tiene que ser mercadolibre o shop" }, { status: 400 });
    return NextResponse.json(await leerPreciosMl(tenantId));
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
