export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { prisma } from "@/lib/prisma";
import { sincronizarFacturacion } from "@/lib/facturacion-ml";
import { NextRequest, NextResponse } from "next/server";

/**
 * Lee la facturación de ML una vez por día (docs/sdd/007). Va aparte del cron de ML porque cada
 * pedido a esta API espera 13 segundos, y los dos juntos no entrarían en los 60 de la función.
 * Si no termina, sigue en la pasada siguiente.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET no configurado" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }
  const cuentas = await prisma.cuentaMercadolibre.findMany({ where: { principal: true }, select: { tenantId: true } });
  const resultados: Array<Record<string, unknown>> = [];
  for (const { tenantId } of cuentas) {
    try {
      resultados.push({ tenantId, ...(await sincronizarFacturacion(tenantId, { presupuestoMs: 45_000 })) });
    } catch (e) {
      resultados.push({ tenantId, error: e instanceof Error ? e.message.slice(0, 300) : "error" });
    }
  }
  return NextResponse.json({ ok: true, resultados });
}
