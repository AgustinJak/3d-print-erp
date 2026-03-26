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
      orderBy: [{ ordenProduccion: { sort: "asc", nulls: "last" } }, { prioridad: "desc" }, { fechaEntrega: "asc" }],
      include: {
        cliente: { select: { id: true, nombre: true } },
        items: {
          include: {
            modelo: {
              select: {
                id: true,
                nombre: true,
                imagenUrl: true,
                categorias: {
                  include: { categoria: true },
                },
              },
            },
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
