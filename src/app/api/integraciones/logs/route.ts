export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "30", 10), 100);
    const origen = searchParams.get("origen");
    const estado = searchParams.get("estado");

    const where: Record<string, unknown> = { tenantId };
    if (origen) where.origen = origen;
    if (estado) where.estado = estado;

    const logs = await prisma.webhookLog.findMany({
      where,
      orderBy: { recibidoEn: "desc" },
      take: limit,
    });

    return NextResponse.json(logs);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
