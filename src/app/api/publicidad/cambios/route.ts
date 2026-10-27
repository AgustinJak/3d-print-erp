export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { aplicarCambio, vistaPreviaDeCambio, type PedidoDeCambio } from "@/lib/publicidad-ml";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/**
 * Cambiar una campaña o un anuncio de Product Ads (docs/sdd/005, spec 002).
 *
 * Sin `aplicar: true` devuelve la vista previa y no toca nada. Con `aplicar`, se vuelve a leer ML,
 * se manda y queda registrado. Lo que pide confirmación aparte (RN-2, RN-3) necesita además
 * `confirmadoAparte: true`.
 */
const Cuerpo = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("campana"),
    id: z.number().int().positive(),
    cambios: z.object({
      budget: z.number().optional(),
      status: z.string().optional(),
      roas_target: z.number().optional(),
      strategy: z.string().optional(),
    }),
    aplicar: z.boolean().optional(),
    confirmadoAparte: z.boolean().optional(),
  }),
  z.object({
    tipo: z.literal("anuncio"),
    id: z.number().int().positive(),
    cambios: z.object({
      status: z.string().optional(),
      campaign_id: z.number().int().positive().optional(),
    }),
    aplicar: z.boolean().optional(),
    confirmadoAparte: z.boolean().optional(),
  }),
]);

export async function POST(request: NextRequest) {
  try {
    const { tenantId, user } = await getAuthenticatedTenantNonDemo();
    const cuerpo = Cuerpo.safeParse(await request.json().catch(() => null));
    if (!cuerpo.success) return NextResponse.json({ error: "pedido inválido" }, { status: 400 });

    const { aplicar, confirmadoAparte, ...resto } = cuerpo.data;
    const pedido = resto as PedidoDeCambio;
    if (!aplicar) return NextResponse.json({ vista: await vistaPreviaDeCambio(tenantId, pedido) });

    const r = await aplicarCambio(tenantId, pedido, {
      origen: "pantalla",
      usuario: user.email ?? user.id,
      confirmadoAparte: !!confirmadoAparte,
    });
    return NextResponse.json(r, { status: r.estado === "aplicado" ? 200 : r.estado === "rechazado" ? 400 : 502 });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
