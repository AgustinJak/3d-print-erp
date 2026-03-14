export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mes = searchParams.get("mes");
  const anio = searchParams.get("anio");

  const ahora = new Date();
  const mesNum = mes ? parseInt(mes) : ahora.getMonth() + 1;
  const anioNum = anio ? parseInt(anio) : ahora.getFullYear();

  const inicioMes = new Date(anioNum, mesNum - 1, 1);
  const finMes = new Date(anioNum, mesNum, 1);
  const inicioAnio = new Date(anioNum, 0, 1);
  const finAnio = new Date(anioNum + 1, 0, 1);

  // Pedidos completados del mes
  const pedidosMes = await prisma.pedido.findMany({
    where: {
      estado: "COMPLETADO",
      fechaPedido: { gte: inicioMes, lt: finMes },
    },
    include: { items: true },
  });

  // Pedidos completados del año
  const pedidosAnio = await prisma.pedido.findMany({
    where: {
      estado: "COMPLETADO",
      fechaPedido: { gte: inicioAnio, lt: finAnio },
    },
    include: { items: true },
  });

  // Gastos del mes
  const gastosMes = await prisma.gasto.findMany({
    where: { fecha: { gte: inicioMes, lt: finMes } },
  });

  // Gastos del año
  const gastosAnio = await prisma.gasto.findMany({
    where: { fecha: { gte: inicioAnio, lt: finAnio } },
  });

  const calcularTotales = (pedidos: typeof pedidosMes) => {
    let ingresos = 0;
    let costoFab = 0;
    pedidos.forEach((p) => {
      p.items.forEach((item) => {
        ingresos += item.precioUnitario * item.cantidad + item.ajusteManual;
        costoFab += item.costoUnitario * item.cantidad;
      });
      ingresos += p.precioEnvio;
    });
    return { ingresos, costoFab, totalPedidos: pedidos.length };
  };

  const totalGastos = (gastos: typeof gastosMes) =>
    gastos.reduce((s, g) => s + g.monto, 0);

  const mesData = calcularTotales(pedidosMes);
  const anioData = calcularTotales(pedidosAnio);
  const gastosMesTotal = totalGastos(gastosMes);
  const gastosAnioTotal = totalGastos(gastosAnio);

  // Gastos agrupados por categoría (mes)
  const gastosPorCategoria: Record<string, number> = {};
  gastosMes.forEach((g) => {
    gastosPorCategoria[g.categoria] = (gastosPorCategoria[g.categoria] || 0) + g.monto;
  });

  // Datos mensuales del año para gráfico
  const datosMensuales = [];
  for (let m = 0; m < 12; m++) {
    const inicio = new Date(anioNum, m, 1);
    const fin = new Date(anioNum, m + 1, 1);
    const pedidosMesI = pedidosAnio.filter(
      (p) => new Date(p.fechaPedido) >= inicio && new Date(p.fechaPedido) < fin
    );
    const gastosMesI = gastosAnio.filter(
      (g) => new Date(g.fecha) >= inicio && new Date(g.fecha) < fin
    );
    const totMes = calcularTotales(pedidosMesI);
    const totGastos = totalGastos(gastosMesI);
    datosMensuales.push({
      mes: inicio.toLocaleString("es-AR", { month: "short" }),
      ingresos: totMes.ingresos,
      costoFab: totMes.costoFab,
      gastos: totGastos,
      ganancia: totMes.ingresos - totMes.costoFab,
    });
  }

  // Billetera de fabricación acumulada (todos los pedidos completados históricos)
  const todosCompletados = await prisma.pedido.findMany({
    where: { estado: "COMPLETADO" },
    include: { items: true },
  });

  let billeteraFabTotal = 0;
  todosCompletados.forEach((p) => {
    p.items.forEach((item) => {
      billeteraFabTotal += item.costoUnitario * item.cantidad;
    });
  });

  // Todos los gastos se descuentan de la billetera de fabricación
  const todosGastosHistoricos = await prisma.gasto.aggregate({
    _sum: { monto: true },
  });
  const totalGastosHistoricos = todosGastosHistoricos._sum.monto || 0;

  // Billetera del mes (costos de fab de pedidos completados este mes)
  let billeteraMes = 0;
  pedidosMes.forEach((p) => {
    p.items.forEach((item) => {
      billeteraMes += item.costoUnitario * item.cantidad;
    });
  });

  return NextResponse.json({
    mes: {
      ingresos: mesData.ingresos,
      costoFab: mesData.costoFab,
      gastos: gastosMesTotal,
      ganancia: mesData.ingresos - mesData.costoFab,
      totalPedidos: mesData.totalPedidos,
    },
    anio: {
      ingresos: anioData.ingresos,
      costoFab: anioData.costoFab,
      gastos: gastosAnioTotal,
      ganancia: anioData.ingresos - anioData.costoFab,
      totalPedidos: anioData.totalPedidos,
    },
    billeteraFab: {
      acumulado: billeteraFabTotal,
      gastado: totalGastosHistoricos,
      disponible: billeteraFabTotal - totalGastosHistoricos,
      mes: billeteraMes,
    },
    gastosPorCategoria,
    datosMensuales,
    mesActual: mesNum,
    anioActual: anioNum,
  });
}
