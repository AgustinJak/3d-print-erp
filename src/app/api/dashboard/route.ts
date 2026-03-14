export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const { tenantId } = await getAuthenticatedTenant();

    const ahora = new Date();
    const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    const finMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 1);

    // Pedidos activos por estado
    const pedidos = await prisma.pedido.findMany({
      where: {
        tenantId,
        estado: { notIn: ["COMPLETADO", "CANCELADO"] },
      },
      include: {
        cliente: { select: { nombre: true } },
        items: {
          include: {
            producto: { select: { nombre: true } },
            modelo: { select: { nombre: true } },
          },
        },
      },
      orderBy: [{ prioridad: "desc" }, { fechaEntrega: "asc" }],
    });

    const enProduccion = pedidos.filter((p) => p.estado === "EN_PRODUCCION").length;
    const pendientesPago = pedidos.filter((p) => p.estado === "PENDIENTE_PAGO").length;
    const terminados = pedidos.filter((p) => p.estado === "TERMINADO").length;
    const esperandoML = pedidos.filter((p) => p.estado === "ESPERANDO_LIQUIDACION_ML").length;
    const confirmados = pedidos.filter((p) => p.estado === "CONFIRMADO").length;
    const entregados = pedidos.filter((p) => p.estado === "ENTREGADO").length;

    // Finanzas del mes (pedidos completados)
    const pedidosCompletadosMes = await prisma.pedido.findMany({
      where: {
        tenantId,
        estado: "COMPLETADO",
        fechaPedido: { gte: inicioMes, lt: finMes },
      },
      include: { items: true },
    });

    let ingresosMes = 0;
    let costoMes = 0;
    pedidosCompletadosMes.forEach((p) => {
      p.items.forEach((item) => {
        ingresosMes += item.precioUnitario * item.cantidad + item.ajusteManual;
        costoMes += item.costoUnitario * item.cantidad;
      });
      ingresosMes += p.precioEnvio;
    });

    const gastosMes = await prisma.gasto.aggregate({
      where: { tenantId, fecha: { gte: inicioMes, lt: finMes } },
      _sum: { monto: true },
    });
    const totalGastosMes = gastosMes._sum.monto || 0;

    // Productos más vendidos (últimos 30 días)
    const hace30Dias = new Date(ahora.getTime() - 30 * 24 * 60 * 60 * 1000);
    const itemsRecientes = await prisma.itemPedido.findMany({
      where: {
        pedido: {
          tenantId,
          fechaPedido: { gte: hace30Dias },
          estado: { notIn: ["CANCELADO"] },
        },
      },
      include: {
        producto: { select: { nombre: true } },
      },
    });

    const ventasPorProducto: Record<string, { nombre: string; cantidad: number; ingresos: number }> = {};
    itemsRecientes.forEach((item) => {
      const key = item.productoId;
      if (!ventasPorProducto[key]) {
        ventasPorProducto[key] = { nombre: item.producto.nombre, cantidad: 0, ingresos: 0 };
      }
      ventasPorProducto[key].cantidad += item.cantidad;
      ventasPorProducto[key].ingresos += item.precioUnitario * item.cantidad + item.ajusteManual;
    });

    const productosTop = Object.values(ventasPorProducto)
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 5);

    // Próximas entregas (pedidos con fecha de entrega futura)
    const proximasEntregas = pedidos
      .filter((p) => p.fechaEntrega && new Date(p.fechaEntrega) >= ahora && !["ENTREGADO", "COMPLETADO", "CANCELADO"].includes(p.estado))
      .slice(0, 5)
      .map((p) => ({
        id: p.id,
        cliente: p.cliente?.nombre || "Sin cliente",
        fechaEntrega: p.fechaEntrega,
        estado: p.estado,
        prioridad: p.prioridad,
        itemsCount: p.items.reduce((s, i) => s + i.cantidad, 0),
      }));

    // Billetera de fabricación acumulada (todos los pedidos completados históricos)
    const todosCompletados = await prisma.pedido.findMany({
      where: { tenantId, estado: "COMPLETADO" },
      include: { items: true },
    });

    let billeteraFabTotal = 0;
    todosCompletados.forEach((p) => {
      p.items.forEach((item) => {
        billeteraFabTotal += item.costoUnitario * item.cantidad;
      });
    });

    // Todos los gastos se descuentan de la billetera de fabricación
    const todosGastos = await prisma.gasto.aggregate({
      where: { tenantId },
      _sum: { monto: true },
    });
    const totalGastosHistoricos = todosGastos._sum.monto || 0;
    const billeteraFabDisponible = billeteraFabTotal - totalGastosHistoricos;

    return NextResponse.json({
      contadores: {
        enProduccion,
        pendientesPago,
        terminados,
        esperandoML,
        confirmados,
        entregados,
        totalActivos: pedidos.length,
      },
      finanzasMes: {
        ingresos: ingresosMes,
        costoFab: costoMes,
        gastos: totalGastosMes,
        ganancia: ingresosMes - costoMes,
        pedidosCompletados: pedidosCompletadosMes.length,
      },
      billeteraFab: {
        acumulado: billeteraFabTotal,
        gastado: totalGastosHistoricos,
        disponible: billeteraFabDisponible,
      },
      productosTop,
      proximasEntregas,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
