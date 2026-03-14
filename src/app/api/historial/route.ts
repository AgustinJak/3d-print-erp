export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";

export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const { searchParams } = new URL(request.url);
    const mes = searchParams.get("mes");
    const anio = searchParams.get("anio");
    const productoId = searchParams.get("productoId");
    const clienteId = searchParams.get("clienteId");
    const canal = searchParams.get("canal");

    const where: Prisma.PedidoWhereInput = {
      tenantId,
      estado: { in: ["COMPLETADO", "ENTREGADO"] },
    };

    if (mes && anio) {
      const inicio = new Date(parseInt(anio), parseInt(mes) - 1, 1);
      const fin = new Date(parseInt(anio), parseInt(mes), 1);
      where.fechaPedido = { gte: inicio, lt: fin };
    } else if (anio) {
      const inicio = new Date(parseInt(anio), 0, 1);
      const fin = new Date(parseInt(anio) + 1, 0, 1);
      where.fechaPedido = { gte: inicio, lt: fin };
    }

    if (clienteId) where.clienteId = clienteId;
    if (canal) where.canalVenta = canal;
    if (productoId) {
      where.items = { some: { productoId } };
    }

    const pedidos = await prisma.pedido.findMany({
      where,
      orderBy: { fechaPedido: "desc" },
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
