export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { costoModelo } from "@/lib/costos";
import { aplicarEstadoPedido, devolverPedido, reasignarReservas } from "@/lib/reservas";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

const itemsInclude = {
  modelo: {
    include: {
      categorias: {
        include: { categoria: true },
      },
    },
  },
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const { id } = await params;
    const pedido = await prisma.pedido.findFirst({
      where: { id, tenantId },
      include: {
        cliente: true,
        items: { include: itemsInclude },
      },
    });
    if (!pedido) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json(pedido);
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

    // Actualización parcial (solo estado, prioridad, fechaLiquidacionMl, fechaEntrega — sin items)
    const keys = Object.keys(body);
    const camposPartial = ["estado", "prioridad", "fechaLiquidacionMl", "fechaEntrega"];
    if (keys.length > 0 && keys.every((k) => camposPartial.includes(k))) {
      const data: Record<string, unknown> = {};
      if (body.estado) data.estado = body.estado;
      if (body.prioridad) data.prioridad = body.prioridad;
      if ("fechaLiquidacionMl" in body) {
        data.fechaLiquidacionMl = body.fechaLiquidacionMl
          ? new Date(body.fechaLiquidacionMl + "T12:00:00")
          : null;
      }
      if ("fechaEntrega" in body) {
        data.fechaEntrega = body.fechaEntrega
          ? new Date(body.fechaEntrega + "T12:00:00")
          : null;
      }
      const pedido = await prisma.pedido.update({
        where: { id, tenantId },
        data,
        include: {
          cliente: { select: { id: true, nombre: true } },
          items: { include: itemsInclude },
        },
      });
      // El estado manda sobre el stock: despachado descuenta de verdad,
      // cancelado devuelve. La prioridad y la fecha de entrega cambian el
      // orden de la cola, así que también obligan a repartir de nuevo.
      if (body.estado) {
        await aplicarEstadoPedido(tenantId, id, pedido.estado);
      } else {
        await reasignarReservas(tenantId);
      }
      return NextResponse.json(pedido);
    }

    // Actualización completa: eliminar items viejos y crear nuevos
    await prisma.itemPedido.deleteMany({ where: { pedidoId: id } });

    // Resolve pricing from Modelo when not explicitly provided
    const itemsData = await Promise.all(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (body.items || []).map(async (item: any) => {
        let precioUnitario = item.precioUnitario;
        let costoUnitario = item.costoUnitario;

        // If pricing not provided, fetch from Modelo
        if (precioUnitario == null || costoUnitario == null) {
          const modelo = await prisma.modelo.findUnique({
            where: { id: item.modeloId },
            select: { precioVenta: true, costoFab: true, costoInsumos: true },
          });
          if (modelo) {
            precioUnitario = precioUnitario ?? modelo.precioVenta;
            costoUnitario = costoUnitario ?? costoModelo(modelo);
          }
        }

        return {
          modeloId: item.modeloId,
          cantidad: item.cantidad || 1,
          precioUnitario: parseFloat(String(precioUnitario ?? 0)),
          costoUnitario: parseFloat(String(costoUnitario ?? 0)),
          ajusteManual: item.ajusteManual ? parseFloat(String(item.ajusteManual)) : 0,
          variantesInfo: item.variantesInfo || undefined,
        };
      })
    );

    const pedido = await prisma.pedido.update({
      where: { id, tenantId },
      data: {
        prioridad: body.prioridad || "MEDIA",
        clienteId: body.clienteId || null,
        fechaEntrega: body.fechaEntrega ? new Date(body.fechaEntrega + "T12:00:00") : null,
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
        fechaLiquidacionMl: body.fechaLiquidacionMl ? new Date(body.fechaLiquidacionMl + "T12:00:00") : null,
        idMercadolibre: body.idMercadolibre || null,
        items: { create: itemsData },
      },
      include: {
        cliente: { select: { id: true, nombre: true } },
        items: { include: itemsInclude },
      },
    });
    // Los items se borraron y se recrearon: las reservas viejas cayeron con
    // ellos, hay que repartir de nuevo lo que este pedido necesita ahora.
    await aplicarEstadoPedido(tenantId, id, pedido.estado);
    return NextResponse.json(pedido);
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
    // Si el pedido ya había descontado stock, la pieza vuelve a la pila antes
    // de borrarlo: si no, el descuento quedaría sin dueño y sin explicación.
    await devolverPedido(tenantId, id, "pedido_eliminado");
    await prisma.pedido.delete({ where: { id, tenantId } });
    await reasignarReservas(tenantId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
