export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { getMlAccount } from "@/lib/mercadolibre";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();

    const cuenta = await getMlAccount(tenantId);
    const envConfigured = Boolean(
      process.env.ML_CLIENT_ID && process.env.ML_CLIENT_SECRET && process.env.ML_REDIRECT_URI
    );

    const [totalEventos, ultimoEvento] = await Promise.all([
      prisma.webhookLog.count({ where: { tenantId, origen: "mercadolibre" } }),
      prisma.webhookLog.findFirst({
        where: { tenantId, origen: "mercadolibre" },
        orderBy: { recibidoEn: "desc" },
        select: { recibidoEn: true, estado: true, evento: true },
      }),
    ]);

    return NextResponse.json({
      envConfigured,
      connected: Boolean(cuenta),
      cuenta: cuenta
        ? {
            mlUserId: cuenta.mlUserId,
            nickname: cuenta.nickname,
            scope: cuenta.scope,
            expiresAt: cuenta.expiresAt,
          }
        : null,
      webhookUrl: "/api/webhooks/mercadolibre",
      totalEventos,
      ultimoEvento,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
