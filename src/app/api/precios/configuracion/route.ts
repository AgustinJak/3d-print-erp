export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { aplicarCambios, CAMPOS, guardarConfig, historialConfig, leerConfig, simular } from "@/lib/precios-config";
import { esRedondeo } from "@/lib/precios-formula";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/**
 * Precios › Configuración (docs/sdd/006, spec 001).
 *
 * GET: la configuración, los campos que se editan, cómo quedan tres productos de ejemplo y los
 * tramos de la web, y el historial. POST sin `aplicar`: lo mismo con los cambios pedidos, sin
 * guardar. Con `aplicar`: guarda y deja el cambio en el historial. No publica ningún precio: los
 * precios nuevos se aplican en Precios.
 */
const Cuerpo = z.object({
  cambios: z.record(z.string(), z.number()),
  redondeo: z.string().optional(),
  aplicar: z.boolean().optional(),
});

export async function GET() {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const config = await leerConfig(tenantId);
    const [sim, historial] = await Promise.all([simular(tenantId, config.gastos, config.redondeo), historialConfig(tenantId)]);
    return NextResponse.json({ config, campos: CAMPOS, ...sim, historial });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { tenantId, user } = await getAuthenticatedTenantNonDemo();
    const cuerpo = Cuerpo.safeParse(await request.json().catch(() => null));
    if (!cuerpo.success) return NextResponse.json({ error: "pedido inválido" }, { status: 400 });
    const config = await leerConfig(tenantId);
    const { gastos, errores } = aplicarCambios(config.gastos, cuerpo.data.cambios);
    const pedido = cuerpo.data.redondeo ?? config.redondeo;
    if (!esRedondeo(pedido)) errores.push("redondeo inválido");
    if (errores.length || !esRedondeo(pedido)) return NextResponse.json({ error: errores.join(". ") }, { status: 400 });
    const redondeo = pedido;
    if (!cuerpo.data.aplicar) return NextResponse.json(await simular(tenantId, gastos, redondeo));
    await guardarConfig(tenantId, gastos, redondeo, user.email ?? user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
