export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { costoModelo } from "@/lib/costos";
import { combinacionesPorId } from "@/lib/combinaciones";
import { coberturaDePedidos, reasignarReservas, reasignarSiElStockCambio } from "@/lib/reservas";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

const ESTADOS_FINALIZADOS = ["COMPLETADO", "CANCELADO"];

const itemsInclude = {
  modelo: {
    include: {
      categorias: {
        include: { categoria: true },
      },
    },
  },
  // La cobertura reparte por la combinación vendible de la línea (docs/sdd/001).
  combinacion: { select: { modeloId: true, variantes: true, sku: true, nombre: true } },
};

export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenant();

    // Igual que en /api/stock: lo que Bodega produjo entra sin pasar por acá,
    // y la cobertura de cada pedido se lee de las reservas.
    try {
      await reasignarSiElStockCambio(tenantId);
    } catch (err) {
      console.error("[api/pedidos] no se pudo repartir antes de leer:", err);
    }
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
      orderBy: [{ ordenProduccion: { sort: "asc", nulls: "last" } }, { prioridad: "desc" }, { fechaPedido: "desc" }],
      include: {
        cliente: { select: { id: true, nombre: true } },
        items: { include: itemsInclude },
      },
    });
    // Qué tiene cubierto cada pedido con el stock que hay hoy, y en qué
    // posición de la cola quedó. Se calcula al vuelo: no se guarda nada.
    const cobertura = await coberturaDePedidos(tenantId, pedidos);
    return NextResponse.json(
      pedidos.map((p) => ({ ...p, cobertura: cobertura.get(p.id) ?? null }))
    );
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
    // La línea es una combinación vendible (docs/sdd/001): si viene, el modelo sale de ella.
    const combinaciones = await combinacionesPorId(
      prisma,
      tenantId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (body.items || []).map((i: any) => i.combinacionId)
    );

    const itemsData = await Promise.all(
      (body.items || []).map(async (item: {
        modeloId: string | null;
        combinacionId?: string | null;
        descripcion?: string | null;
        cantidad?: number;
        precioUnitario?: number;
        costoUnitario?: number;
        ajusteManual?: number;
        variantesInfo?: Array<{ nombre: string; precioAdicional: number }>;
      }) => {
        let precioUnitario = item.precioUnitario;
        let costoUnitario = item.costoUnitario;

        // If pricing not provided, fetch from Modelo
        if (item.modeloId && (precioUnitario == null || costoUnitario == null)) {
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
          // Sin modelo = pieza a medida: se guarda con su descripción.
          combinacionId: item.combinacionId && combinaciones.has(item.combinacionId) ? item.combinacionId : null,
          modeloId:
            (item.combinacionId && combinaciones.get(item.combinacionId)?.modeloId) || item.modeloId || null,
          descripcion: item.modeloId ? null : item.descripcion?.trim() || "Pieza a medida",
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
    // Pedido nuevo: que agarre el stock que le toque según la cola.
    await reasignarReservas(tenantId);

    return NextResponse.json(pedido, { status: 201 });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
