export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { malPedido, responder } from "@/lib/api-envoltura";
import { vistaPreviaAjuste } from "@/lib/ajustes-precio-vista";

/**
 * POST /api/precios/ajustes/vista-previa { modeloIds[], canal, tipo, valor, borrar? } → el precio de
 * hoy y el nuevo de cada producto, sin guardar (docs/sdd/015, RN-5).
 */
export async function POST(request: NextRequest) {
  return responder(async () => {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const body = await request.json().catch(() => null);
    if (!body) return malPedido("Pedido vacío");
    const r = await vistaPreviaAjuste(tenantId, body);
    return "error" in r ? malPedido(r.error) : r;
  });
}
