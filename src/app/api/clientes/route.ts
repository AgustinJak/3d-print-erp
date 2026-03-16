export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const clientes = await prisma.cliente.findMany({
      where: { tenantId },
      orderBy: { creadoEn: "desc" },
      include: {
        pedidos: {
          select: {
            id: true,
            estado: true,
            metodoPago: true,
            fechaPedido: true,
            precioEnvio: true,
            senia: true,
            items: {
              select: {
                precioUnitario: true,
                cantidad: true,
                ajusteManual: true,
              },
            },
          },
        },
      },
    });

    const result = clientes.map((c) => {
      const totalGastado = c.pedidos
        .filter((p) => p.estado !== "CANCELADO")
        .reduce((sum, p) => {
          const itemsTotal = p.items.reduce(
            (s, i) => s + i.precioUnitario * i.cantidad + i.ajusteManual,
            0
          );
          return sum + itemsTotal + p.precioEnvio;
        }, 0);

      const pedidosCount = c.pedidos.filter((p) => p.estado !== "CANCELADO").length;

      return {
        id: c.id,
        nombre: c.nombre,
        telefono: c.telefono,
        email: c.email,
        direccion: c.direccion,
        notas: c.notas,
        plataforma: c.plataforma,
        tipoCliente: c.tipoCliente,
        creadoEn: c.creadoEn,
        totalGastado,
        pedidosCount,
      };
    });

    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const body = await request.json();
    const cliente = await prisma.cliente.create({
      data: {
        nombre: body.nombre,
        telefono: body.telefono || null,
        email: body.email || null,
        direccion: body.direccion || null,
        notas: body.notas || null,
        plataforma: body.plataforma || null,
        tipoCliente: body.tipoCliente || null,
        tenantId,
      },
    });
    return NextResponse.json(cliente, { status: 201 });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
