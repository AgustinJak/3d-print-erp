export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { malPedido, responder } from "@/lib/api-envoltura";
import { guardarRecetaDePieza } from "@/lib/recetas-de-piezas";

/**
 * PATCH /api/piezas/:id { gramos?, segundos?, materialId?, insumos? } → la receta de la pieza de
 * Bodega. Recalcula los costos de los productos que la usan (docs/sdd/014, spec 003, REQ-7).
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return responder(async () => {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return malPedido("Pedido vacío");
    const r = await guardarRecetaDePieza(tenantId, id, body);
    return "error" in r ? malPedido(r.error) : r;
  });
}
