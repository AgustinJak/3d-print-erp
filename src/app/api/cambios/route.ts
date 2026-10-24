export const dynamic = "force-dynamic";

import { altasAutomaticas } from "@/lib/altas-bodega";
import { aplicarCostosSiCambio } from "@/lib/sincronizar-costos";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextResponse } from "next/server";

/**
 * "¿Cambió algo?" — una huella barata del estado del tenant.
 *
 * Las pantallas la consultan cada pocos segundos y sólo se recargan de verdad
 * cuando la huella cambia. Así el pedido que entra por webhook o por cron
 * aparece solo, sin F5 y sin traerse la lista entera cada vez.
 *
 * Son tres agregados sobre tablas chicas: mucho más barato que releer pedidos.
 */
export async function GET() {
  try {
    const { tenantId } = await getAuthenticatedTenant();

    // Una pieza nueva en Bodega tiene que aparecer sola, sin depender de que
    // alguien abra justo la pantalla de Stock. Acá es donde se nota: esto se
    // consulta cada pocos segundos, y si creó algo la huella cambia y la
    // pantalla se recarga sin que nadie apriete nada.
    //
    // `altasAutomaticas` arranca con un conteo de una sola consulta y se va
    // enseguida cuando no hay nada pendiente, que es casi siempre.
    try {
      await altasAutomaticas(tenantId);
    } catch (err) {
      console.error("[api/cambios] no se pudieron dar de alta modelos de Bodega:", err);
    }
    // Lo mismo con los costos: una consulta, y sólo trabaja si Bodega cambió algo.
    try {
      await aplicarCostosSiCambio(tenantId);
    } catch (err) {
      console.error("[api/cambios] no se pudieron aplicar los costos de Bodega:", err);
    }

    const [pedidos, stock, reservas] = await Promise.all([
      prisma.pedido.aggregate({ where: { tenantId }, _count: true, _max: { updatedAt: true } }),
      prisma.stock.aggregate({ where: { tenantId }, _count: true, _max: { updatedAt: true } }),
      prisma.reservaStock.count({ where: { tenantId } }),
    ]);

    const v = [
      pedidos._count,
      pedidos._max.updatedAt?.getTime() ?? 0,
      stock._count,
      stock._max.updatedAt?.getTime() ?? 0,
      reservas,
    ].join("-");

    return NextResponse.json({ v }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
