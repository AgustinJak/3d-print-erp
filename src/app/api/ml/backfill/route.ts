export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { getMlAccount, searchOrders, type MlOrder } from "@/lib/mercadolibre";
import { processMlOrderGroup } from "@/lib/mercadolibre-sync";
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

    // 1. Traer TODAS las órdenes del rango (todas las páginas)
    const todas: MlOrder[] = [];
    let offset = 0;
    const limit = 50;
    let total = Infinity;
    while (offset < total) {
      const search = await searchOrders(tenantId, {
        sellerId: cuenta.mlUserId,
        from,
        to,
        offset,
        limit,
      });
      total = search.paging.total;
      if (search.results.length === 0) break;
      todas.push(...search.results);
      offset += limit;
    }

    // 2. Agrupar por pack (pack_id ?? order.id) → un pedido por compra
    const grupos = new Map<string, MlOrder[]>();
    for (const o of todas) {
      const key = String(o.pack_id ?? o.id);
      const arr = grupos.get(key);
      if (arr) arr.push(o);
      else grupos.set(key, [o]);
    }

    const stats = {
      compras: grupos.size,
      creadas: 0,
      actualizadas: 0,
      ya_existian: 0,
      ignoradas: 0,
      errores: 0,
    };
    const detalleErrores: string[] = [];

    // 3. Procesar cada grupo
    let procesadas = 0;
    for (const [key, orders] of grupos) {
      if (procesadas >= maxOrders) break;
      procesadas++;
      try {
        const result = await processMlOrderGroup(tenantId, orders, { source: "backfill" });
        switch (result.action) {
          case "created": stats.creadas++; break;
          case "updated": stats.actualizadas++; break;
          case "skipped_existing": stats.ya_existian++; break;
          case "ignored": stats.ignoradas++; break;
        }
      } catch (e) {
        stats.errores++;
        const msg = e instanceof Error ? e.message : "error";
        if (detalleErrores.length < 20) {
          detalleErrores.push(`Compra ${key}: ${msg}`.slice(0, 200));
        }
      }
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
      total_ordenes_ml: todas.length,
      total_compras: grupos.size,
      stats,
      errores: detalleErrores,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
