export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { responder } from "@/lib/api-envoltura";
import { ErrorDeCatalogo } from "@/lib/catalogo";
import { crearProductoCompleto } from "@/lib/alta-producto";
import type { EntradaAlta } from "@/lib/alta-producto-reglas";

/**
 * POST /api/productos/alta → crea el producto con sus piezas de Bodega, sus filas de stock, sus
 * variantes, la funda y el archivo de cada pieza, de una vez (docs/sdd/014, spec 002). Los
 * archivos se suben antes a la biblioteca: acá llegan sólo sus ids.
 */
export async function POST(request: NextRequest) {
  return responder(async () => {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const body = (await request.json().catch(() => null)) as EntradaAlta | null;
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Pedido vacío" }, { status: 400 });
    try {
      return await crearProductoCompleto(tenantId, body);
    } catch (e) {
      if (e instanceof ErrorDeCatalogo) return NextResponse.json({ error: e.message }, { status: 400 });
      throw e;
    }
  });
}
