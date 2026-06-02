export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { getMlAccount, searchOrders } from "@/lib/mercadolibre";
import { processMlOrder } from "@/lib/mercadolibre-sync";
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma";

/**
 * Trae las órdenes de los últimos N días desde Mercado Libre y las inserta.
 * Idempotente: las órdenes ya cargadas se saltean, así que es seguro re-ejecutar
 * (si se corta por timeout, volver a llamar continúa con las que faltan).
 *
 * POST /api/ml/backfill?days=30
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
    const days = Math.min(Math.max(parseInt(searchParams.get("days") || "30", 10), 1), 90);
    const maxOrders = Math.min(
      Math.max(parseInt(searchParams.get("max") || "200", 10), 1),
      500
    );

    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const to = new Date().toISOString();

    const stats = {
      revisadas: 0,
      creadas: 0,
      actualizadas: 0,
      ya_existian: 0,
      ignoradas: 0,
      errores: 0,
    };
    const detalleErrores: string[] = [];

    let offset = 0;
    const limit = 50;
    let total = Infinity;

    while (offset < total && stats.revisadas < maxOrders) {
      const search = await searchOrders(tenantId, {
        sellerId: cuenta.mlUserId,
        from,
        to,
        offset,
        limit,
      });
      total = search.paging.total;
      if (search.results.length === 0) break;

      for (const order of search.results) {
        if (stats.revisadas >= maxOrders) break;
        stats.revisadas++;
        try {
          const result = await processMlOrder(tenantId, order, { source: "backfill" });
          switch (result.action) {
            case "created":
              stats.creadas++;
              break;
            case "updated":
              stats.actualizadas++;
              break;
            case "skipped_existing":
              stats.ya_existian++;
              break;
            case "ignored":
              stats.ignoradas++;
              break;
          }
        } catch (e) {
          stats.errores++;
          const msg = e instanceof Error ? e.message : "error";
          if (detalleErrores.length < 20) {
            detalleErrores.push(`Orden ${order.id}: ${msg}`.slice(0, 200));
          }
        }
      }

      offset += limit;
    }

    // Log resumen
    await prisma.webhookLog
      .create({
        data: {
          tenantId,
          origen: "mercadolibre",
          evento: "backfill",
          estado: stats.errores > 0 ? "error" : "ok",
          errorMsg: `creadas:${stats.creadas} actualizadas:${stats.actualizadas} ya_existian:${stats.ya_existian} ignoradas:${stats.ignoradas} errores:${stats.errores}`,
          payload: { days, maxOrders, stats, detalleErrores } as unknown as Prisma.InputJsonValue,
        },
      })
      .catch(() => {});

    return NextResponse.json({
      ok: true,
      rango_dias: days,
      total_en_ml: Number.isFinite(total) ? total : null,
      stats,
      errores: detalleErrores,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
