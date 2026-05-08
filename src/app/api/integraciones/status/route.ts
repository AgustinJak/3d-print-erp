export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();

    const [secretConfigured, totalLogs, ultimoLog, totalRevision] = await Promise.all([
      Promise.resolve(Boolean(process.env.SHOP_WEBHOOK_SECRET)),
      prisma.webhookLog.count({ where: { tenantId } }),
      prisma.webhookLog.findFirst({
        where: { tenantId },
        orderBy: { recibidoEn: "desc" },
        select: { recibidoEn: true, estado: true },
      }),
      prisma.pedido.count({
        where: { tenantId, etiquetas: { has: "revision_manual" } },
      }),
    ]);

    // URL pública del webhook (basada en la request actual)
    const webhookUrl = "/api/webhook/shop/pedido";

    return NextResponse.json({
      shop: {
        secretConfigured,
        webhookUrl,
        totalLogs,
        ultimoLog,
        totalRevision,
      },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
