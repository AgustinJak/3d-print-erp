export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { aplicarPromos, vistaPreviaPromos } from "@/lib/promos-ml";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/**
 * Prender, cambiar o sacar promos de ML (spec 010, REQ-4 y REQ-7). Nunca lo hace el ERP solo.
 *
 * Sin `aplicar: true` devuelve la vista previa contra lo que ML tiene ahora y no toca nada. Con
 * `aplicar`, cada uno se vuelve a revisar, se manda, se verifica con lo que paga el cliente y queda
 * registrado. Hasta 20 por pedido: la pantalla manda los que eligió de a tandas.
 */
const Pedido = z.object({
  mla: z.string().regex(/^MLA\d+$/),
  accion: z.enum(["sumar", "cambiar", "sacar"]),
  promocionId: z.string().nullable(),
  promocionTipo: z.string().min(1),
  precio: z.number().positive().nullable(),
});
const Cuerpo = z.object({ pedidos: z.array(Pedido).min(1).max(20), aplicar: z.boolean().optional() });

export async function POST(request: NextRequest) {
  try {
    const { tenantId, user } = await getAuthenticatedTenantNonDemo();
    const cuerpo = Cuerpo.safeParse(await request.json().catch(() => null));
    if (!cuerpo.success) return NextResponse.json({ error: "pedido inválido" }, { status: 400 });
    const { pedidos, aplicar } = cuerpo.data;
    if (!aplicar) return NextResponse.json({ vista: await vistaPreviaPromos(tenantId, pedidos) });
    return NextResponse.json({ resultados: await aplicarPromos(tenantId, pedidos, user.email ?? user.id) });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
