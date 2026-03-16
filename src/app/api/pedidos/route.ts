export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

const ESTADOS_FINALIZADOS = ["COMPLETADO", "ENTREGADO", "CANCELADO"];

const itemsInclude = {
  modelo: {
    include: {
      categorias: {
        include: { categoria: true },
      },
    },
  },
};

export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const { searchParams } = new URL(request.url);
    const estado = searchParams.get("estado");
    const incluirTodos = searchParams.get("todos") === "true";

    const estadoWhere = estado
      ? { estado: estado as never }
      : incluirTodos
        ? {}
        : { estado: { notIn: ESTADOS_FINALIZADOS as never } };

    const pedidos = await prisma.pedido.findMany({
      where: { tenantId, ...estadoWhere },
      orderBy: [{ prioridad: "desc" }, { fechaPedido: "desc" }],
      include: {
        cliente: { select: { id: true, nombre: true } },
        items: { include: itemsInclude },
      },
    });
    return NextResponse.json(pedidos);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const body = await request.json();

    // Resolve pricing from Modelo when not explicitly provided
    const itemsData = await Promise.all(
      (body.items || []).map(async (item: {
        modeloId: string;
        cantidad?: number;
        precioUnitario?: number;
        costoUnitario?: number;
        ajusteManual?: number;
        variantesInfo?: Array<{ nombre: string; precioAdicional: number }>;
      }) => {
        let precioUnitario = item.precioUnitario;
        let costoUnitario = item.costoUnitario;

        // If pricing not provided, fetch from Modelo
        if (precioUnitario == null || costoUnitario == null) {
          const modelo = await prisma.modelo.findUnique({
            where: { id: item.modeloId },
            select: { precioVenta: true, costoFab: true },
          });
          if (modelo) {
            precioUnitario = precioUnitario ?? modelo.precioVenta;
            costoUnitario = costoUnitario ?? modelo.costoFab;
          }
        }

        return {
          modeloId: item.modeloId,
          cantidad: item.cantidad || 1,
          precioUnitario: parseFloat(String(precioUnitario ?? 0)),
          costoUnitario: parseFloat(String(costoUnitario ?? 0)),
          ajusteManual: item.ajusteManual ? parseFloat(String(item.ajusteManual)) : 0,
          variantesInfo: item.variantesInfo ?? null,
        };
      })
    );

    const pedido = await prisma.pedido.create({
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
        tenantId,
        items: { create: itemsData },
      },
      include: {
        cliente: { select: { id: true, nombre: true } },
        items: { include: itemsInclude },
      },
    });
    return NextResponse.json(pedido, { status: 201 });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
