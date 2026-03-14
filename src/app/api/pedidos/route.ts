import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

const ESTADOS_FINALIZADOS = ["COMPLETADO", "ENTREGADO", "CANCELADO"];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const estado = searchParams.get("estado");
  const incluirTodos = searchParams.get("todos") === "true";

  const where = estado
    ? { estado: estado as never }
    : incluirTodos
      ? undefined
      : { estado: { notIn: ESTADOS_FINALIZADOS as never } };

  const pedidos = await prisma.pedido.findMany({
    where,
    orderBy: [{ prioridad: "desc" }, { fechaPedido: "desc" }],
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

export async function POST(request: NextRequest) {
  const body = await request.json();
  const pedido = await prisma.pedido.create({
    data: {
      prioridad: body.prioridad || "MEDIA",
      clienteId: body.clienteId || null,
      fechaEntrega: body.fechaEntrega ? new Date(body.fechaEntrega) : null,
      estado: body.estado || "PENDIENTE_PAGO",
      metodoEnvio: body.metodoEnvio || null,
      metodoPago: body.metodoPago || null,
      precioEnvio: body.precioEnvio ? parseFloat(body.precioEnvio) : 0,
      senia: body.senia ? parseFloat(body.senia) : 0,
      contacto: body.contacto || null,
      notas: body.notas || null,
      etiquetas: body.etiquetas || [],
      canalVenta: body.canalVenta || "directa",
      comprobanteUrl: body.comprobanteUrl || null,
      items: {
        create: (body.items || []).map((item: {
          productoId: string;
          modeloId?: string;
          cantidad: number;
          precioUnitario: number;
          costoUnitario: number;
          ajusteManual?: number;
        }) => ({
          productoId: item.productoId,
          modeloId: item.modeloId || null,
          cantidad: item.cantidad || 1,
          precioUnitario: parseFloat(String(item.precioUnitario)),
          costoUnitario: parseFloat(String(item.costoUnitario)),
          ajusteManual: item.ajusteManual ? parseFloat(String(item.ajusteManual)) : 0,
        })),
      },
    },
    include: {
      cliente: { select: { id: true, nombre: true } },
      items: true,
    },
  });
  return NextResponse.json(pedido, { status: 201 });
}
