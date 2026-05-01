export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const { tenantId } = await getAuthenticatedTenant();

    const pedidos = await prisma.pedido.findMany({
      where: {
        tenantId,
        etiquetas: { has: "revision_manual" },
      },
      orderBy: { creadoEn: "desc" },
      include: {
        cliente: { select: { id: true, nombre: true, email: true } },
        items: {
          include: {
            modelo: { select: { id: true, nombre: true, sku: true } },
          },
        },
      },
      take: 50,
    });

    return NextResponse.json(pedidos);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
