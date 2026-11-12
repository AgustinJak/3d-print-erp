export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { cuentasMl } from "@/lib/mercadolibre";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();

    const cuentas = await cuentasMl(tenantId);
    const cuenta = cuentas.find((c) => c.principal) ?? null;
    const envConfigured = Boolean(
      process.env.ML_CLIENT_ID && process.env.ML_CLIENT_SECRET && process.env.ML_REDIRECT_URI
    );

    const [totalEventos, ultimoEvento, sinMapear] = await Promise.all([
      prisma.webhookLog.count({ where: { tenantId, origen: "mercadolibre" } }),
      prisma.webhookLog.findFirst({
        where: { tenantId, origen: "mercadolibre" },
        orderBy: { recibidoEn: "desc" },
        select: { recibidoEn: true, estado: true, evento: true },
      }),
      prisma.publicacionMl.count({
        where: { tenantId, modeloId: null, ignorar: false },
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
      // Las otras cuentas conectadas (docs/sdd/010).
      otras: cuentas.filter((c) => !c.principal).map((c) => ({ id: c.id, nombre: c.nombre, nickname: c.nickname, mlUserId: c.mlUserId })),
      webhookUrl: "/api/webhooks/mercadolibre",
      totalEventos,
      ultimoEvento,
      publicacionesSinMapear: sinMapear,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
