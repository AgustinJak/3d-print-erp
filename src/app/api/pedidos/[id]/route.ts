export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const pedido = await prisma.pedido.findUnique({
    where: { id },
    include: {
      cliente: true,
      items: {
        include: {
          producto: { select: { id: true, nombre: true } },
          modelo: { select: { id: true, nombre: true } },
        },
      },
    },
  });
  if (!pedido) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(pedido);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  // Si solo se actualiza el estado
  if (body.estado && Object.keys(body).length === 1) {
    const pedido = await prisma.pedido.update({
      where: { id },
      data: { estado: body.estado },
    });
    return NextResponse.json(pedido);
  }

  // Actualización completa: eliminar items viejos y crear nuevos
  await prisma.itemPedido.deleteMany({ where: { pedidoId: id } });

  const pedido = await prisma.pedido.update({
    where: { id },
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
  return NextResponse.json(pedido);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.pedido.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
