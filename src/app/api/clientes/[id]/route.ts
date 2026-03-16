export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const { id } = await params;
    const cliente = await prisma.cliente.findUnique({
      where: { id, tenantId },
      include: {
        pedidos: {
          orderBy: { fechaPedido: "desc" },
          include: {
            items: {
              include: {
                modelo: {
                  select: { id: true, nombre: true, imagenUrl: true },
                },
              },
            },
          },
        },
      },
    });

    if (!cliente) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }

    const pedidosNoCancel = cliente.pedidos.filter((p) => p.estado !== "CANCELADO");

    // Total gastado
    const totalGastado = pedidosNoCancel.reduce((sum, p) => {
      const itemsTotal = p.items.reduce(
        (s, i) => s + i.precioUnitario * i.cantidad + i.ajusteManual,
        0
      );
      return sum + itemsTotal + p.precioEnvio;
    }, 0);

    // Método de pago más habitual
    const pagoCounts: Record<string, number> = {};
    pedidosNoCancel.forEach((p) => {
      if (p.metodoPago) {
        pagoCounts[p.metodoPago] = (pagoCounts[p.metodoPago] || 0) + 1;
      }
    });
    const metodoHabitual = Object.entries(pagoCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    // Meses más frecuentes
    const mesCounts: Record<number, number> = {};
    pedidosNoCancel.forEach((p) => {
      const mes = new Date(p.fechaPedido).getMonth();
      mesCounts[mes] = (mesCounts[mes] || 0) + 1;
    });
    const mesesNombres = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    const mesFrecuente = Object.entries(mesCounts).sort((a, b) => b[1] - a[1])[0];
    const mesHabitual = mesFrecuente ? mesesNombres[Number(mesFrecuente[0])] : null;

    // Día de la semana más frecuente
    const diaCounts: Record<number, number> = {};
    pedidosNoCancel.forEach((p) => {
      const dia = new Date(p.fechaPedido).getDay();
      diaCounts[dia] = (diaCounts[dia] || 0) + 1;
    });
    const diasNombres = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    const diaFrec = Object.entries(diaCounts).sort((a, b) => b[1] - a[1])[0];
    const diaHabitual = diaFrec ? diasNombres[Number(diaFrec[0])] : null;

    // Ticket promedio
    const ticketPromedio = pedidosNoCancel.length > 0 ? totalGastado / pedidosNoCancel.length : 0;

    // Pedidos en curso (no completados ni cancelados)
    const enCurso = cliente.pedidos.filter(
      (p) => p.estado !== "COMPLETADO" && p.estado !== "CANCELADO"
    ).length;

    return NextResponse.json({
      ...cliente,
      metricas: {
        totalGastado,
        pedidosCount: pedidosNoCancel.length,
        enCurso,
        ticketPromedio,
        metodoHabitual,
        mesHabitual,
        diaHabitual,
      },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const { id } = await params;
    const body = await request.json();
    const cliente = await prisma.cliente.update({
      where: { id, tenantId },
      data: {
        nombre: body.nombre,
        telefono: body.telefono || null,
        email: body.email || null,
        direccion: body.direccion || null,
        notas: body.notas || null,
        plataforma: body.plataforma || null,
        tipoCliente: body.tipoCliente || null,
      },
    });
    return NextResponse.json(cliente);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const { id } = await params;
    await prisma.cliente.delete({ where: { id, tenantId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
