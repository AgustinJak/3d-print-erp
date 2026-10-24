export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { leerPreciosMl } from "@/lib/precios-ml";
import { leerPreciosShop } from "@/lib/precios-shop";
import { armarPropuesta } from "@/lib/precios-propuesta";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

/**
 * Lee los precios publicados de un canal y los guarda en el mapeo (spec 004, RN-2). No cambia nada
 * en el canal.
 *
 *   POST ?canal=mercadolibre   → GET /items, /prices y /sale_price de cada publicación mapeada
 *   POST ?canal=shop           → el endpoint de precios del Shop con simular: true
 */
export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const canal = request.nextUrl.searchParams.get("canal");
    if (canal === "shop") {
      // El Shop devuelve lo que se cobra hoy simulando con los precios propuestos.
      const propuesta = await armarPropuesta(tenantId);
      const propuestos = new Map(propuesta.canales.filter((f) => f.canal === "shop").map((f) => [f.clave, f.propuesto]));
      return NextResponse.json(await leerPreciosShop(tenantId, (clave) => propuestos.get(clave) ?? null));
    }
    if (canal !== "mercadolibre") return NextResponse.json({ error: "canal tiene que ser mercadolibre o shop" }, { status: 400 });
    return NextResponse.json(await leerPreciosMl(tenantId));
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
