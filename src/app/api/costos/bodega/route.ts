export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { prisma } from "@/lib/prisma";
import { costosPorFilaDeStock, leerParametros } from "@/lib/costos-bodega";
import { aplicarPlanDeCostos, planDeCostos } from "@/lib/sincronizar-costos";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

/**
 * Traer los costos de Bodega al ERP, con vista previa.
 *
 * El GET calcula qué cambiaría y no toca nada; el POST escribe lo que se le
 * pida. Está separado a propósito y no colgado del cron: cuando el dato de
 * Bodega está viejo —una katana costeada antes de que se midieran sus insumos
 * figura más barata de lo que es— aplicarlo a ciegas haría ver margen donde no
 * hay. Que alguien mire la lista antes es más barato que descubrirlo tres meses
 * después en la rentabilidad.
 *
 * Por eso el POST acepta `excluir`: casi siempre hay uno para dejar afuera y
 * arreglar en Bodega primero.
 */
export async function GET() {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();

    const [parametros, costos, plan, filas] = await Promise.all([
      leerParametros(),
      costosPorFilaDeStock(tenantId),
      planDeCostos(tenantId),
      prisma.stock.count({ where: { tenantId } }),
    ]);

    return NextResponse.json({
      parametros,
      cobertura: {
        filas,
        conReceta: costos.size,
        sinInsumosDeclarados: [...costos.values()].filter((c) => c.insumosSinDeclarar).length,
      },
      plan,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const body = await request.json().catch(() => ({}));
    const excluir: string[] = Array.isArray(body?.excluir) ? body.excluir : [];

    // Se recalcula acá en vez de aceptar el plan del cliente: entre que se
    // mostró la vista previa y se apretó el botón pudo cambiar algo, y el que
    // manda es el estado de la base, no lo que quedó en pantalla.
    const plan = await planDeCostos(tenantId);
    const resultado = await aplicarPlanDeCostos(plan, { excluir });

    return NextResponse.json({ ok: true, ...resultado });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
