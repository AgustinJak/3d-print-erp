export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { getMlAccount } from "@/lib/mercadolibre";
import {
  actualizarLiquidacionYEstado,
  estadoPuedeAvanzarAEsperandoLiq,
} from "@/lib/mercadolibre-sync";
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma";

/**
 * Recorre los pedidos del inventario que son de Mercado Libre y todavía no
 * tienen la liquidación resuelta (o la tienen estimada), los busca en ML por
 * su id_mercadolibre y les asigna la fecha de liquidación + el estado según el
 * envío. Cubre los pedidos cargados a mano y los que quedaron fuera del
 * back-fill de 30 días.
 *
 * Re-ejecutable: los que ya tienen liquidación real se saltean sin llamar a ML.
 *
 * POST /api/ml/actualizar-liquidaciones?max=80
 */
export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();

    const cuenta = await getMlAccount(tenantId);
    if (!cuenta) {
      return NextResponse.json(
        { error: "No hay cuenta de Mercado Libre conectada" },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const max = Math.min(Math.max(parseInt(searchParams.get("max") || "40", 10), 1), 300);

    // Candidatos: pedidos ML en estados activos con id_mercadolibre cargado.
    const candidatos = await prisma.pedido.findMany({
      where: {
        tenantId,
        idMercadolibre: { not: null },
        estado: {
          in: [
            "CONFIRMADO",
            "EN_PRODUCCION",
            "TERMINADO",
            "ENTREGADO",
            "ESPERANDO_LIQUIDACION_ML",
          ],
        },
      },
      select: {
        id: true,
        estado: true,
        idMercadolibre: true,
        fechaLiquidacionMl: true,
        origenExterno: true,
      },
      orderBy: { fechaPedido: "desc" },
    });

    const stats = { revisados: 0, actualizados: 0, ya_resueltos: 0, no_encontrados: 0, errores: 0 };
    const detalleErrores: string[] = [];

    for (const p of candidatos) {
      if (stats.actualizados >= max) break;

      // Saltear solo si ya tiene liquidación REAL Y el estado ya no puede
      // avanzar (sino hay que re-chequear el envío para actualizar el estado).
      const oe = (p.origenExterno ?? {}) as Record<string, unknown>;
      const liquidacionEstimada = oe.liquidacion_estimada === true;
      const tieneReal = p.fechaLiquidacionMl != null && !liquidacionEstimada && "liquidacion_estimada" in oe;
      if (tieneReal && !estadoPuedeAvanzarAEsperandoLiq(p.estado)) {
        stats.ya_resueltos++;
        continue;
      }

      stats.revisados++;
      try {
        const res = await actualizarLiquidacionYEstado(tenantId, {
          id: p.id,
          estado: p.estado,
          idMercadolibre: p.idMercadolibre,
        });
        if (res.ok) stats.actualizados++;
        else if (res.reason === "no_encontrado_en_ml") stats.no_encontrados++;
      } catch (e) {
        stats.errores++;
        const msg = e instanceof Error ? e.message : "error";
        if (detalleErrores.length < 20) {
          detalleErrores.push(`Pedido ${p.idMercadolibre}: ${msg}`.slice(0, 200));
        }
      }
    }

    await prisma.webhookLog
      .create({
        data: {
          tenantId,
          origen: "mercadolibre",
          evento: "actualizar_liquidaciones",
          estado: stats.errores > 0 ? "error" : "ok",
          errorMsg: `actualizados:${stats.actualizados} ya_resueltos:${stats.ya_resueltos} no_encontrados:${stats.no_encontrados} errores:${stats.errores}`,
          payload: { max, stats, detalleErrores } as unknown as Prisma.InputJsonValue,
        },
      })
      .catch(() => {});

    return NextResponse.json({ ok: true, total_candidatos: candidatos.length, stats, errores: detalleErrores });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
