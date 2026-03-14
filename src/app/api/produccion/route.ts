import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  // Obtener todos los pedidos en producción o confirmados, con sus items
  const pedidos = await prisma.pedido.findMany({
    where: {
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
}
