export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { malPedido, responder } from "@/lib/api-envoltura";
import { ajustesPorModelo, borrarAjuste, guardarAjuste } from "@/lib/ajustes-precio";
import type { CanalAjuste, TipoAjuste } from "@/lib/ajustes-precio-reglas";

/**
 * Los ajustes de precio por producto (docs/sdd/015).
 *
 * GET    /api/precios/ajustes?modelo=id → los de un producto (vigentes y vencidos)
 * PUT    /api/precios/ajustes { modeloIds[], canal, tipo, valor, hasta?, nota? } → el mismo ajuste en uno o varios
 * DELETE /api/precios/ajustes { modeloIds[], canal, tipo }
 *
 * Nada de esto publica: cambian los precios propuestos (RN-1).
 */
export async function GET(request: NextRequest) {
  return responder(async () => {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const modelo = request.nextUrl.searchParams.get("modelo");
    const todos = await ajustesPorModelo(tenantId, modelo ? [modelo] : undefined);
    return { ajustes: modelo ? (todos[modelo] ?? []) : todos };
  });
}

export async function PUT(request: NextRequest) {
  return responder(async () => {
    const { tenantId, user } = await getAuthenticatedTenantNonDemo();
    const body = await request.json().catch(() => null);
    if (!body) return malPedido("Pedido vacío");
    const r = await guardarAjuste(tenantId, user.email ?? user.id, body);
    return "error" in r ? malPedido(r.error) : r;
  });
}

export async function DELETE(request: NextRequest) {
  return responder(async () => {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const body = (await request.json().catch(() => null)) as { modeloIds?: string[]; canal?: CanalAjuste; tipo?: TipoAjuste } | null;
    if (!body?.modeloIds?.length || !body.canal || !body.tipo) return malPedido("Faltan los productos, el canal o el tipo");
    return { borrados: await borrarAjuste(tenantId, { modeloIds: body.modeloIds, canal: body.canal, tipo: body.tipo }) };
  });
}
