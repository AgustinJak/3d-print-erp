export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { NextResponse } from "next/server";

interface OrphanedSku {
  sku: string | null;
  nombre_producto: string;
  count: number;
  ultimo_pedido: { externoId: string | null; fecha: string };
}

interface ShopItemPayload {
  sku?: string | null;
  nombre_producto?: string;
  cantidad?: number;
}

interface ShopWebhookPayload {
  numero_pedido?: string;
  items?: ShopItemPayload[];
}

/**
 * GET /api/integraciones/skus-audit
 *
 * Devuelve un panorama del estado de mapeo de SKUs:
 *  - Estadísticas generales de modelos
 *  - Lista de modelos sin SKU
 *  - Lista de "SKUs huérfanos": items de pedidos del shop con SKU/nombre
 *    que NO matchea con ningún modelo del inventario
 */
export async function GET() {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();

    // ─── Stats de modelos ───────────────────────────────
    const [totalActivos, conSku, consolidados, modelosSinSku] = await Promise.all([
      prisma.modelo.count({
        where: { tenantId, activo: true, consolidadoEnId: null },
      }),
      prisma.modelo.count({
        where: { tenantId, activo: true, consolidadoEnId: null, sku: { not: null } },
      }),
      prisma.modelo.count({
        where: { tenantId, consolidadoEnId: { not: null } },
      }),
      prisma.modelo.findMany({
        where: { tenantId, activo: true, consolidadoEnId: null, sku: null },
        select: {
          id: true,
          nombre: true,
          serie: true,
          imagenUrl: true,
          categorias: { include: { categoria: { select: { nombre: true, color: true } } } },
        },
        orderBy: { nombre: "asc" },
      }),
    ]);

    // ─── SKUs huérfanos ─────────────────────────────────
    // Buscamos en los WebhookLog OK los items que tenían SKU pero no matchearon.
    // Como el webhook ya creó el pedido (con warnings), sabemos que NO hay match
    // si en el log aparece un warning con "Producto sin match" para ese SKU.
    const logs = await prisma.webhookLog.findMany({
      where: {
        tenantId,
        origen: "shop",
        evento: "pedido.confirmado",
        estado: { in: ["ok", "error"] },
      },
      orderBy: { recibidoEn: "desc" },
      take: 200,
      select: {
        externoId: true,
        recibidoEn: true,
        payload: true,
        errorMsg: true,
      },
    });

    // Construyo set de SKUs ya existentes en modelos (para filtrar fácilmente)
    const skusModelos = await prisma.modelo.findMany({
      where: { tenantId, sku: { not: null } },
      select: { sku: true },
    });
    const skusExistentes = new Set(
      skusModelos.map((m) => m.sku!.toLowerCase()),
    );

    const orphanMap = new Map<string, OrphanedSku>();
    for (const log of logs) {
      const payload = log.payload as ShopWebhookPayload | null;
      const items = payload?.items;
      if (!Array.isArray(items)) continue;

      for (const item of items) {
        const sku = item.sku?.trim() || null;
        const nombre = item.nombre_producto?.trim() || "(sin nombre)";

        // Si el SKU ya existe en un modelo, NO es huérfano
        if (sku && skusExistentes.has(sku.toLowerCase())) continue;

        // Solo cuento como huérfano si tenía SKU. Si no tenía, lo registro
        // bajo el nombre.
        const key = sku || `name:${nombre.toLowerCase()}`;
        const existing = orphanMap.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          orphanMap.set(key, {
            sku,
            nombre_producto: nombre,
            count: 1,
            ultimo_pedido: {
              externoId: log.externoId,
              fecha: log.recibidoEn.toISOString(),
            },
          });
        }
      }
    }

    const orphans = Array.from(orphanMap.values()).sort((a, b) => b.count - a.count);

    return NextResponse.json({
      stats: {
        totalActivos,
        conSku,
        sinSku: totalActivos - conSku,
        consolidados,
        huerfanos: orphans.length,
      },
      modelosSinSku,
      orphans,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
