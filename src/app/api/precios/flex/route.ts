export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { cambiarEntrega, DIAS_MAX, estadoFlex } from "@/lib/flex-ml";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/**
 * Entrega de publicaciones de ML: Flex y tiempo de disponibilidad (docs/sdd/006, spec 007). Sin
 * `aplicar`, cómo está cada una ahora (y el stock del ERP, como pista); con `aplicar`, se lleva cada
 * una al modo pedido, se verifica y queda registrado. Hasta 20 por pedido.
 */
const Cuerpo = z.object({
  mlas: z.array(z.string().regex(/^MLA\d+$/)).min(1).max(20),
  entrega: z.discriminatedUnion("modo", [
    z.object({ modo: z.literal("inmediata") }),
    z.object({ modo: z.literal("a_pedido"), dias: z.number().int().min(1).max(DIAS_MAX) }),
  ]),
  aplicar: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const { tenantId, user } = await getAuthenticatedTenantNonDemo();
    const cuerpo = Cuerpo.safeParse(await request.json().catch(() => null));
    if (!cuerpo.success) return NextResponse.json({ error: "pedido inválido" }, { status: 400 });
    const { mlas, entrega, aplicar } = cuerpo.data;
    if (!aplicar) return NextResponse.json({ estados: await estadoFlex(tenantId, mlas) });
    return NextResponse.json({ resultados: await cambiarEntrega(tenantId, mlas, entrega, user.email ?? user.id) });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
