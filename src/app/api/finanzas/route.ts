export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

type PedidoConItems = {
  fechaPedido: Date;
  updatedAt: Date;
  precioEnvio: number;
  senia: number;
  items: {
    precioUnitario: number;
    costoUnitario: number;
    cantidad: number;
    ajusteManual: number;
  }[];
};

export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
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

    // ─── Pedidos del mes y del año ─────────────────────────
    const pedidosMes = await prisma.pedido.findMany({
      where: {
        tenantId,
        estado: "COMPLETADO",
        updatedAt: { gte: inicioMes, lt: finMes },
      },
      include: { items: true },
    });
    const pedidosAnio = await prisma.pedido.findMany({
      where: {
        tenantId,
        estado: "COMPLETADO",
        updatedAt: { gte: inicioAnio, lt: finAnio },
      },
      include: { items: true },
    });
    const todosCompletados = await prisma.pedido.findMany({
      where: { tenantId, estado: "COMPLETADO" },
      include: { items: true },
    });

    // ─── Gastos ───────────────────────────────────────────
    const gastosMes = await prisma.gasto.findMany({
      where: { tenantId, fecha: { gte: inicioMes, lt: finMes } },
    });
    const gastosAnio = await prisma.gasto.findMany({
      where: { tenantId, fecha: { gte: inicioAnio, lt: finAnio } },
    });
    const todosGastos = await prisma.gasto.findMany({ where: { tenantId } });

    // ─── Transferencias ───────────────────────────────────
    const todasTransferencias = await prisma.transferencia.findMany({
      where: { tenantId },
      orderBy: { fecha: "desc" },
    });

    // ─── Helpers ──────────────────────────────────────────
    const calcularTotales = (pedidos: PedidoConItems[]) => {
      let ingresos = 0;       // venta de productos (sin envío)
      let costoFab = 0;
      let envios = 0;
      pedidos.forEach((p) => {
        p.items.forEach((item) => {
          ingresos += item.precioUnitario * item.cantidad + item.ajusteManual;
          costoFab += item.costoUnitario * item.cantidad;
        });
        envios += p.precioEnvio;
      });
      return { ingresos, costoFab, envios, ganancia: ingresos - costoFab };
    };

    const sumGastos = (gastos: typeof gastosMes, billetera?: string) =>
      gastos
        .filter((g) => !billetera || g.billetera === billetera)
        .reduce((s, g) => s + g.monto, 0);

    // ─── Resúmenes mes/año ────────────────────────────────
    const mesData = calcularTotales(pedidosMes);
    const anioData = calcularTotales(pedidosAnio);

    const gastosMesTotal = sumGastos(gastosMes);
    const gastosMesFab = sumGastos(gastosMes, "fabricacion");
    const gastosMesEmp = sumGastos(gastosMes, "empresarial");
    const gastosAnioTotal = sumGastos(gastosAnio);

    // ─── Billetera Fabricación (acumulado histórico) ──────
    const totalCompletados = calcularTotales(todosCompletados);
    const billeteraFabIngresos = totalCompletados.costoFab; // costo_fab de TODOS los completados
    const billeteraFabGastos = sumGastos(todosGastos, "fabricacion");
    const transfeHaciaFab = todasTransferencias
      .filter((t) => t.hacia === "fabricacion")
      .reduce((s, t) => s + t.monto, 0);
    const transfeDesdeFab = todasTransferencias
      .filter((t) => t.desde === "fabricacion")
      .reduce((s, t) => s + t.monto, 0);
    const billeteraFabDisponible =
      billeteraFabIngresos + transfeHaciaFab - billeteraFabGastos - transfeDesdeFab;

    // ─── Billetera Empresarial (acumulado histórico) ──────
    const billeteraEmpIngresos = totalCompletados.ganancia; // ganancia neta de TODOS los completados
    const billeteraEmpGastos = sumGastos(todosGastos, "empresarial");
    const transfeHaciaEmp = todasTransferencias
      .filter((t) => t.hacia === "empresarial")
      .reduce((s, t) => s + t.monto, 0);
    const transfeDesdeEmp = todasTransferencias
      .filter((t) => t.desde === "empresarial")
      .reduce((s, t) => s + t.monto, 0);
    const billeteraEmpDisponible =
      billeteraEmpIngresos + transfeHaciaEmp - billeteraEmpGastos - transfeDesdeEmp;

    // ─── Aportado al mes seleccionado ─────────────────────
    let billeteraFabMes = 0;
    let billeteraEmpMes = 0;
    pedidosMes.forEach((p) => {
      p.items.forEach((item) => {
        billeteraFabMes += item.costoUnitario * item.cantidad;
        billeteraEmpMes +=
          item.precioUnitario * item.cantidad + item.ajusteManual -
          item.costoUnitario * item.cantidad;
      });
    });

    // ─── Gastos por categoría (mes) ───────────────────────
    const gastosPorCategoria: Record<string, number> = {};
    gastosMes.forEach((g) => {
      gastosPorCategoria[g.categoria] = (gastosPorCategoria[g.categoria] || 0) + g.monto;
    });

    // ─── Datos mensuales para gráfico ─────────────────────
    const datosMensuales = [];
    for (let m = 0; m < 12; m++) {
      const inicio = new Date(anioNum, m, 1);
      const fin = new Date(anioNum, m + 1, 1);
      const pedidosM = pedidosAnio.filter(
        (p) => new Date(p.updatedAt) >= inicio && new Date(p.updatedAt) < fin
      );
      const gastosM = gastosAnio.filter(
        (g) => new Date(g.fecha) >= inicio && new Date(g.fecha) < fin
      );
      const totM = calcularTotales(pedidosM);
      datosMensuales.push({
        mes: inicio.toLocaleString("es-AR", { month: "short" }),
        ingresos: totM.ingresos,
        costoFab: totM.costoFab,
        gastos: sumGastos(gastosM),
        gastosFab: sumGastos(gastosM, "fabricacion"),
        gastosEmp: sumGastos(gastosM, "empresarial"),
        ganancia: totM.ganancia,
      });
    }

    // ─── Cuotas en curso ──────────────────────────────────
    // Agrupa las cuotas activas (mismo grupoCuotasId) y muestra cuántas
    // pagadas/restantes con base en la fecha.
    const cuotasActivasRaw = await prisma.gasto.findMany({
      where: { tenantId, grupoCuotasId: { not: null } },
      orderBy: [{ grupoCuotasId: "asc" }, { cuotaNumero: "asc" }],
    });
    type CuotaGrupo = {
      grupoCuotasId: string;
      descripcion: string;
      categoria: string;
      billetera: string;
      montoCuota: number;
      cuotaTotal: number;
      pagadas: number;
      pendientes: number;
      proximaCuotaFecha: Date | null;
      proximaCuotaNumero: number | null;
      totalAcumulado: number;
    };
    const grupos: Record<string, CuotaGrupo> = {};
    cuotasActivasRaw.forEach((g) => {
      if (!g.grupoCuotasId) return;
      const k = g.grupoCuotasId;
      if (!grupos[k]) {
        grupos[k] = {
          grupoCuotasId: k,
          descripcion: (g.descripcion || "").replace(/ \(Cuota \d+\/\d+\)$/, ""),
          categoria: g.categoria,
          billetera: g.billetera,
          montoCuota: g.monto,
          cuotaTotal: g.cuotaTotal ?? 0,
          pagadas: 0,
          pendientes: 0,
          proximaCuotaFecha: null,
          proximaCuotaNumero: null,
          totalAcumulado: 0,
        };
      }
      grupos[k].totalAcumulado += g.monto;
      if (g.fecha <= ahora) {
        grupos[k].pagadas += 1;
      } else {
        grupos[k].pendientes += 1;
        if (
          !grupos[k].proximaCuotaFecha ||
          g.fecha < grupos[k].proximaCuotaFecha!
        ) {
          grupos[k].proximaCuotaFecha = g.fecha;
          grupos[k].proximaCuotaNumero = g.cuotaNumero;
        }
      }
    });
    const cuotasEnCurso = Object.values(grupos)
      .filter((g) => g.pendientes > 0)
      .sort((a, b) => {
        if (!a.proximaCuotaFecha) return 1;
        if (!b.proximaCuotaFecha) return -1;
        return a.proximaCuotaFecha.getTime() - b.proximaCuotaFecha.getTime();
      });

    // Cuotas pagadas en el mes seleccionado
    const cuotasPagadasMes = gastosMes
      .filter((g) => g.grupoCuotasId)
      .map((g) => ({
        id: g.id,
        fecha: g.fecha,
        monto: g.monto,
        categoria: g.categoria,
        descripcion: g.descripcion,
        billetera: g.billetera,
        cuotaNumero: g.cuotaNumero,
        cuotaTotal: g.cuotaTotal,
        grupoCuotasId: g.grupoCuotasId,
      }));

    // ─── Timeline unificada de movimientos del mes ────────
    type Movimiento = {
      id: string;
      fecha: Date;
      tipo: "gasto" | "cuota" | "transferencia" | "aporte" | "retiro" | "pedido";
      descripcion: string;
      billetera: string;             // billetera principal afectada
      monto: number;                 // siempre positivo
      direccion: "entrada" | "salida" | "ambos";
      meta?: Record<string, unknown>; // datos extra para mostrar
    };

    const movimientos: Movimiento[] = [];

    // Gastos individuales (no cuotas)
    gastosMes
      .filter((g) => !g.grupoCuotasId)
      .forEach((g) => {
        movimientos.push({
          id: `g-${g.id}`,
          fecha: g.fecha,
          tipo: "gasto",
          descripcion: g.descripcion || g.categoria,
          billetera: g.billetera,
          monto: g.monto,
          direccion: "salida",
          meta: { categoria: g.categoria },
        });
      });

    // Cuotas ejecutadas en el mes
    gastosMes
      .filter((g) => g.grupoCuotasId)
      .forEach((g) => {
        movimientos.push({
          id: `c-${g.id}`,
          fecha: g.fecha,
          tipo: "cuota",
          descripcion: (g.descripcion || g.categoria).replace(/ \(Cuota \d+\/\d+\)$/, ""),
          billetera: g.billetera,
          monto: g.monto,
          direccion: "salida",
          meta: {
            categoria: g.categoria,
            cuotaNumero: g.cuotaNumero,
            cuotaTotal: g.cuotaTotal,
            grupoCuotasId: g.grupoCuotasId,
          },
        });
      });

    // Transferencias / aportes / retiros del mes
    todasTransferencias
      .filter((t) => t.fecha >= inicioMes && t.fecha < finMes)
      .forEach((t) => {
        const esAporte = t.desde === "externo";
        const esRetiro = t.hacia === "externo";
        const tipo: Movimiento["tipo"] =
          esAporte ? "aporte" :
          esRetiro ? "retiro" :
          "transferencia";
        movimientos.push({
          id: `t-${t.id}`,
          fecha: t.fecha,
          tipo,
          descripcion: t.descripcion || (
            esAporte ? "Aporte de capital" :
            esRetiro ? "Retiro de capital" :
            `Transferencia ${t.desde} → ${t.hacia}`
          ),
          billetera: esAporte ? t.hacia : t.desde, // dónde se ve la "salida" o "entrada principal"
          monto: t.monto,
          direccion: esAporte ? "entrada" : esRetiro ? "salida" : "ambos",
          meta: { desde: t.desde, hacia: t.hacia },
        });
      });

    // Pedidos completados del mes — aportan a las dos billeteras
    pedidosMes.forEach((p) => {
      let aporteFab = 0;
      let aporteEmp = 0;
      p.items.forEach((it) => {
        aporteFab += it.costoUnitario * it.cantidad;
        aporteEmp += it.precioUnitario * it.cantidad + it.ajusteManual - it.costoUnitario * it.cantidad;
      });
      const totalPedido = aporteFab + aporteEmp;
      movimientos.push({
        id: `p-${p.id}`,
        fecha: p.updatedAt,
        tipo: "pedido",
        descripcion: `Pedido completado${p.externoId ? ` ${p.externoId}` : ""}`,
        billetera: "ambos",
        monto: totalPedido,
        direccion: "entrada",
        meta: {
          pedidoId: p.id,
          externoId: p.externoId,
          aporteFab,
          aporteEmp,
          items: p.items.length,
        },
      });
    });

    movimientos.sort((a, b) => b.fecha.getTime() - a.fecha.getTime());

    // ─── Pedidos en curso ─────────────────────────────────
    const pedidosEnCurso = await prisma.pedido.findMany({
      where: { tenantId, estado: { notIn: ["COMPLETADO", "CANCELADO"] } },
      include: { items: true },
    });

    let totalEnCurso = 0;
    let costoEnCurso = 0;
    let cobradoEnCurso = 0;
    const enCursoPorEstado: Record<string, { cantidad: number; total: number }> = {};

    pedidosEnCurso.forEach((p) => {
      const totalPedido = p.items.reduce(
        (s, item) => s + item.precioUnitario * item.cantidad + item.ajusteManual, 0
      ) + p.precioEnvio;
      const costoPedido = p.items.reduce(
        (s, item) => s + item.costoUnitario * item.cantidad, 0
      );
      totalEnCurso += totalPedido;
      costoEnCurso += costoPedido;
      cobradoEnCurso += p.senia;
      if (!enCursoPorEstado[p.estado]) enCursoPorEstado[p.estado] = { cantidad: 0, total: 0 };
      enCursoPorEstado[p.estado].cantidad += 1;
      enCursoPorEstado[p.estado].total += totalPedido;
    });

    // ─── Historial de transferencias del mes ──────────────
    const transferenciasMes = todasTransferencias.filter(
      (t) => t.fecha >= inicioMes && t.fecha < finMes
    );

    return NextResponse.json({
      mes: {
        ingresos: mesData.ingresos,
        costoFab: mesData.costoFab,
        gastos: gastosMesTotal,
        gastosFab: gastosMesFab,
        gastosEmp: gastosMesEmp,
        ganancia: mesData.ganancia,
        gananciaNeta: mesData.ganancia - gastosMesEmp, // después de gastos empresariales
        totalPedidos: pedidosMes.length,
      },
      anio: {
        ingresos: anioData.ingresos,
        costoFab: anioData.costoFab,
        gastos: gastosAnioTotal,
        ganancia: anioData.ganancia,
        totalPedidos: pedidosAnio.length,
      },
      billeteraFab: {
        acumulado: billeteraFabIngresos + transfeHaciaFab,
        gastado: billeteraFabGastos,
        transferencias: transfeDesdeFab,
        disponible: billeteraFabDisponible,
        mes: billeteraFabMes,
      },
      billeteraEmp: {
        acumulado: billeteraEmpIngresos + transfeHaciaEmp,
        gastado: billeteraEmpGastos,
        transferencias: transfeDesdeEmp,
        disponible: billeteraEmpDisponible,
        mes: billeteraEmpMes,
      },
      gastosPorCategoria,
      datosMensuales,
      mesActual: mesNum,
      anioActual: anioNum,
      pedidosEnCurso: {
        total: totalEnCurso,
        costoFab: costoEnCurso,
        ganancia: totalEnCurso - costoEnCurso,
        cobrado: cobradoEnCurso,
        pendiente: totalEnCurso - cobradoEnCurso,
        cantidad: pedidosEnCurso.length,
        porEstado: enCursoPorEstado,
      },
      cuotasEnCurso,
      cuotasPagadasMes,
      transferenciasMes,
      movimientos,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
