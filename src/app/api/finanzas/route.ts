export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { saldoBilletera, yaOcurrio as yaOcurrioHoy } from "@/lib/billeteras";
import { cargosPorMes, cargosVacios, ultimaLecturaDeMl } from "@/lib/resultado-mes";
import { NextRequest, NextResponse } from "next/server";

type PedidoConItems = {
  fechaPedido: Date;
  updatedAt: Date;
  completadoEn: Date | null;
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
        completadoEn: { gte: inicioMes, lt: finMes },
      },
      include: { items: true },
    });
    const pedidosAnio = await prisma.pedido.findMany({
      where: {
        tenantId,
        estado: "COMPLETADO",
        completadoEn: { gte: inicioAnio, lt: finAnio },
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

    // ─── Flex: bonificación de ML vs pago a la logística (dato informativo) ───
    // A la logística se le paga los lunes, por semana: cada semana de lunes a domingo se paga el
    // lunes siguiente. El mes muestra las semanas que se pagan en ese mes.
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const masDias = (dia: string, n: number) => iso(new Date(new Date(`${dia}T12:00:00Z`).getTime() + n * 864e5));
    const lunesDe = (dia: string) => masDias(dia, -((new Date(`${dia}T12:00:00Z`).getUTCDay() + 6) % 7));
    const finMesIso = iso(new Date(Date.UTC(anioNum, mesNum, 0)));
    const inicioMesIso = `${anioNum}-${String(mesNum).padStart(2, "0")}-01`;
    const pagaEnElMes = (pago: string) => pago >= inicioMesIso && pago <= finMesIso;

    // Lo que entró de verdad a Mercado Pago, por el día en que entró.
    const flexEntradas = await prisma.flexMl.findMany({ where: { tenantId, deOtro: false }, select: { dia: true, monto: true } });
    const semanasFlex = new Map<string, { desde: string; hasta: string; pago: string; envios: number; bonificado: number; pagado: number }>();
    const semanaFlex = (desde: string) => {
      const pago = masDias(desde, 7);
      if (!pagaEnElMes(pago)) return null;
      if (!semanasFlex.has(desde)) semanasFlex.set(desde, { desde, hasta: masDias(desde, 6), pago, envios: 0, bonificado: 0, pagado: 0 });
      return semanasFlex.get(desde)!;
    };
    for (const v of flexEntradas) {
      const f = semanaFlex(lunesDe(v.dia));
      if (f) {
        f.envios++;
        f.bonificado += v.monto;
      }
    }
    // Un pago cuenta para la semana anterior a la de su fecha.
    for (const g of todosGastos) {
      if (!/flex/i.test(g.categoria)) continue;
      const f = semanaFlex(masDias(lunesDe(iso(g.fecha)), -7));
      if (f) f.pagado += g.monto;
    }
    const flexSemanas = [...semanasFlex.values()].sort((a, b) => a.desde.localeCompare(b.desde));
    const flexBonificado = flexSemanas.reduce((s, f) => s + f.bonificado, 0);
    const flexPagadoLogistica = flexSemanas.reduce((s, f) => s + f.pagado, 0);

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

    const yaOcurrio = (fecha: Date) => yaOcurrioHoy(fecha, ahora);

    // Solo cuenta gastos cuya fecha ya pasó (o es hoy). Las cuotas futuras
    // NO se descuentan de la billetera hasta que llega su fecha.
    const sumGastosEjecutados = (gastos: typeof gastosMes, billetera?: string) =>
      gastos
        .filter((g) => yaOcurrio(g.fecha))
        .filter((g) => !billetera || g.billetera === billetera)
        .reduce((s, g) => s + g.monto, 0);

    const cfgBilletera = (await prisma.configTenant.findUnique({ where: { tenantId } }))?.data as { billeteraEmpresarialDesde?: string } | null;
    const billeteraEmpDesdeMes = cfgBilletera?.billeteraEmpresarialDesde?.slice(0, 7) ?? "0000-00";

    // ─── Lo que factura ML (docs/sdd/007) ──────────────────
    const cargosMl = await cargosPorMes(tenantId);
    const claveMes = (a: number, m: number) => `${a}-${String(m).padStart(2, "0")}`;
    // Sólo desde que el ERP cuenta ventas: antes habría cargos sin sus ingresos.
    const primerCompletado = todosCompletados.reduce<Date | null>((min, p) => (p.completadoEn && (!min || p.completadoEn < min) ? p.completadoEn : min), null);
    const desdeMes = primerCompletado ? claveMes(primerCompletado.getFullYear(), primerCompletado.getMonth() + 1) : "9999-99";
    const cargosDe = (a: number, m: number) => (claveMes(a, m) >= desdeMes && cargosMl.get(claveMes(a, m))) || cargosVacios(a, m);
    const cargosDelMes = cargosDe(anioNum, mesNum);
    const historicos = [...cargosMl].filter(([mm]) => mm >= desdeMes && mm >= billeteraEmpDesdeMes).map(([, c]) => c);
    const cargosHistoricos = historicos.reduce((s, c) => s + c.neto, 0);
    const flexHistorico = historicos.reduce((s, c) => s + c.flex.ingresos, 0);

    // ─── Resúmenes mes/año ────────────────────────────────
    const mesData = calcularTotales(pedidosMes);
    const anioData = calcularTotales(pedidosAnio);

    // Para mostrar lo gastado en el mes/año, solo contamos los gastos cuya
    // fecha ya pasó. Cuotas futuras se ven en "Cuotas en curso".
    const gastosMesTotal = sumGastosEjecutados(gastosMes);
    const gastosMesFab = sumGastosEjecutados(gastosMes, "fabricacion");
    const gastosMesEmp = sumGastosEjecutados(gastosMes, "empresarial");
    const gastosAnioTotal = sumGastosEjecutados(gastosAnio);

    // ─── Billeteras (acumulado histórico) ─────────────────
    // La misma cuenta que el panel (src/lib/billeteras.ts). El "disponible" solo cuenta
    // cosas que ya pasaron: pedidos completados, gastos con fecha <= hoy y transferencias
    // ya hechas. Las cuotas futuras se ven en "Cuotas en curso" pero no descuentan.
    const totalCompletados = calcularTotales(todosCompletados);
    const fab = saldoBilletera("fabricacion", totalCompletados.costoFab, todosGastos, todasTransferencias, ahora);
    // La empresarial cuenta desde su fecha de inicio, si tiene (config_tenant.billeteraEmpresarialDesde):
    // Agustín la reinició el 2026-11-06 porque los retiros de antes salían de una ganancia mal calculada.
    // No se borra nada: lo anterior sigue en Movimientos y en la vista por año.
    const empDesdeTexto = cfgBilletera?.billeteraEmpresarialDesde ?? null;
    const empDesde = empDesdeTexto ? new Date(`${empDesdeTexto}T00:00:00`) : null;
    const contaEmp = (d: Date | null) => !empDesde || (d != null && d >= empDesde);
    const emp = saldoBilletera(
      "empresarial",
      calcularTotales(todosCompletados.filter((p) => contaEmp(p.completadoEn))).ganancia,
      todosGastos.filter((g) => contaEmp(g.fecha)),
      todasTransferencias.filter((t) => contaEmp(t.fecha)),
      ahora
    );
    const billeteraFabIngresos = fab.entra;
    const billeteraFabGastosEjecutados = fab.gastado;
    const transfeHaciaFab = fab.transferidoHacia;
    const transfeDesdeFab = fab.transferidoDesde;
    const billeteraFabDisponible = fab.disponible;
    const billeteraEmpIngresos = emp.entra;
    const billeteraEmpGastosEjecutados = emp.gastado;
    const transfeHaciaEmp = emp.transferidoHacia;
    const transfeDesdeEmp = emp.transferidoDesde;
    const billeteraEmpDisponible = emp.disponible + flexHistorico - cargosHistoricos;

    // Compromisos futuros (cuotas + gastos con fecha posterior a hoy)
    const compromisosFuturosFab = fab.comprometido - fab.gastado;
    const compromisosFuturosEmp = emp.comprometido - emp.gastado;

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
        (p) => p.completadoEn != null && p.completadoEn >= inicio && p.completadoEn < fin
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
        gastosEmp: sumGastosEjecutados(gastosM, "empresarial"),
        ganancia: totM.ganancia,
        cargosMl: cargosDe(anioNum, m + 1).neto,
        // Los pagos a la logística ya son gastos de la billetera empresarial.
        neta: totM.ganancia + cargosDe(anioNum, m + 1).flex.ingresos - cargosDe(anioNum, m + 1).neto - sumGastosEjecutados(gastosM, "empresarial"),
        flex: cargosDe(anioNum, m + 1).flex.ingresos,
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
      if (yaOcurrio(g.fecha)) {
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
        fecha: p.completadoEn ?? p.updatedAt,
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
        // Después de lo que factura ML (lo de Shay ya descontado) y de los gastos empresariales.
        gananciaNeta: mesData.ganancia + cargosDelMes.flex.ingresos - cargosDelMes.neto - gastosMesEmp,
        // Sin los pagos a la logística, que van en su propio renglón.
        gastosEmpSinFlex: gastosMesEmp - cargosDelMes.flex.pagos,
        cargosMl: cargosDelMes,
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
        gastado: billeteraFabGastosEjecutados,
        compromisosFuturos: compromisosFuturosFab,
        transferencias: transfeDesdeFab,
        disponible: billeteraFabDisponible,
        mes: billeteraFabMes,
      },
      billeteraEmp: {
        desde: empDesdeTexto,
        acumulado: billeteraEmpIngresos + flexHistorico + transfeHaciaEmp,
        gastado: billeteraEmpGastosEjecutados + cargosHistoricos,
        cargosMl: cargosHistoricos,
        compromisosFuturos: compromisosFuturosEmp,
        transferencias: transfeDesdeEmp,
        disponible: billeteraEmpDisponible,
        mes: billeteraEmpMes + cargosDelMes.flex.ingresos - cargosDelMes.neto,
      },
      ml: { leidoEn: await ultimaLecturaDeMl(tenantId) },
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
      flex: {
        bonificado: flexBonificado,
        pagadoLogistica: flexPagadoLogistica,
        sobrante: flexBonificado - flexPagadoLogistica,
        semanas: flexSemanas,
      },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
