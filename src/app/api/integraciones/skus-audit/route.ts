export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { NextResponse } from "next/server";

/**
 * GET /api/integraciones/skus-audit
 *
 * Cuántos modelos tienen SKU y cuáles no.
 *
 * Hasta el 2026-10-24 también listaba "SKUs huérfanos": las líneas de los últimos
 * 200 avisos del Shop cuyo SKU no estaba en el inventario. Con el mapeo por canal
 * (docs/sdd/001) el SKU dejó de ser lo que vincula una venta, y esa lista mentía:
 * un aviso viejo no cambia, así que una venta ya resuelta seguía apareciendo para
 * siempre. Lo que un canal vende y no se reconoce está en la cola de Integraciones ›
 * Mapeo.
 */
export async function GET() {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();

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

    return NextResponse.json({
      stats: {
        totalActivos,
        conSku,
        sinSku: totalActivos - conSku,
        consolidados,
      },
      modelosSinSku,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
