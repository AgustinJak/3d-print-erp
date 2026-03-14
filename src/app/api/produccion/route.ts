export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const { tenantId } = await getAuthenticatedTenant();

    // Obtener todos los pedidos en producción o confirmados, con sus items
    const pedidos = await prisma.pedido.findMany({
      where: {
        tenantId,
        estado: { in: ["CONFIRMADO", "EN_PRODUCCION"] },
      },
      orderBy: [{ prioridad: "desc" }, { fechaEntrega: "asc" }],
      include: {
        cliente: { select: { id: true, nombre: true } },
        items: {
          include: {
            producto: { select: { id: true, nombre: true } },
            modelo: { select: { id: true, nombre: true } },
          },
        },
      },
    });

    return NextResponse.json(pedidos);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
