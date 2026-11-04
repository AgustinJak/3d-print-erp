export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { billeteraFabricacion, yaOcurrio } from "@/lib/billeteras";
import { completarLiquidados } from "@/lib/ml-lote";
import { cargosPorMes, cargosVacios } from "@/lib/resultado-mes";
import { NextResponse } from "next/server";

/** Los estados de un pedido que todavía hay que despachar o entregar. */
const POR_DESPACHAR = ["CONFIRMADO", "EN_PRODUCCION", "TERMINADO"] as const;

type Canal = "mercadolibre" | "shop" | "otros";
const canalDe = (c: string): Canal => (c === "mercadolibre" || c === "shop" ? c : "otros");
const porCanal = () => ({ mercadolibre: 0, shop: 0, otros: 0 });

/**
 * Inicio del día en Argentina (UTC-3, sin horario de verano), corrido `dias` días. Las
 * fechas de entrega se guardan en UTC: sin esto, a la noche "hoy" ya sería mañana.
 */
function inicioDiaAr(ahora: Date, dias = 0): Date {
  const ar = new Date(ahora.getTime() - 3 * 3600_000);
  return new Date(Date.UTC(ar.getUTCFullYear(), ar.getUTCMonth(), ar.getUTCDate() + dias, 3));
}

export async function GET() {
  try {
    const { tenantId } = await getAuthenticatedTenant();

    const ahora = new Date();
    // Los mismos límites que Finanzas, para que los números coincidan.
    const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    const finMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 1);

    // Lo hace también el cron diario; acá, para que lo liquidado hoy ya se vea.
    await completarLiquidados(tenantId, ahora);

    const [conteos, abiertos, pedidosCompletadosMes, gastosMes, billeteraFab, cola, esperandoMapeo, faltante] =
      await Promise.all([
        prisma.pedido.groupBy({
          by: ["estado"],
          where: { tenantId, estado: { in: ["PENDIENTE_PAGO", "ESPERANDO_LIQUIDACION_ML", ...POR_DESPACHAR] } },
          _count: { _all: true },
        }),
        prisma.pedido.findMany({
          where: { tenantId, estado: { in: [...POR_DESPACHAR] } },
          select: {
            id: true,
            fechaEntrega: true,
            estado: true,
            prioridad: true,
            canalVenta: true,
            etiquetas: true,
            cliente: { select: { nombre: true } },
            items: { select: { cantidad: true } },
          },
          orderBy: { fechaEntrega: "asc" },
        }),
        // Cobrado en el mes: por la fecha en que se completó, no por la última edición.
        prisma.pedido.findMany({
          where: { tenantId, estado: "COMPLETADO", completadoEn: { gte: inicioMes, lt: finMes } },
          select: { precioEnvio: true, items: { select: { precioUnitario: true, cantidad: true, ajusteManual: true, costoUnitario: true } } },
        }),
        prisma.gasto.findMany({
          where: { tenantId, fecha: { gte: inicioMes, lt: finMes } },
          select: { fecha: true, monto: true, billetera: true },
        }),
        billeteraFabricacion(tenantId, ahora),
        prisma.mapeoCanal.groupBy({
          by: ["canal"],
          where: { tenantId, combinacionId: null, ignorar: false },
          _count: { _all: true },
        }),
        // Pedidos abiertos con alguna línea cuya clave sigue en la cola de Mapeo.
        prisma.$queryRaw<Array<{ n: number }>>`
          SELECT COUNT(DISTINCT p.id)::int AS n
          FROM pedidos p
          JOIN items_pedido i ON i.pedido_id = p.id
          JOIN mapeos_canal m ON m.tenant_id = p.tenant_id AND m.canal = p.canal_venta AND m.clave = i.clave_canal
          WHERE p.tenant_id = ${tenantId}
            AND p.estado NOT IN ('COMPLETADO', 'CANCELADO')
            AND m.combinacion_id IS NULL AND NOT m.ignorar
        `,
        prisma.produccionPendiente.aggregate({
          where: { tenantId, unidades: { gt: 0 } },
          _sum: { unidades: true },
          _count: { _all: true },
        }),
      ]);

    const contar = (estado: string) => conteos.find((c) => c.estado === estado)?._count._all ?? 0;

    // ─── Para despachar ───────────────────────────────────
    const hoy = inicioDiaAr(ahora);
    const manana = inicioDiaAr(ahora, 1);
    const pasado = inicioDiaAr(ahora, 2);
    const despacho = { atrasados: porCanal(), hoy: porCanal(), manana: porCanal() };
    for (const p of abiertos) {
      if (!p.fechaEntrega) continue;
      const c = canalDe(p.canalVenta);
      if (p.fechaEntrega < hoy) despacho.atrasados[c]++;
      else if (p.fechaEntrega < manana) despacho.hoy[c]++;
      else if (p.fechaEntrega < pasado) despacho.manana[c]++;
    }
    // Primero los atrasados (vienen ordenados por fecha), después lo que sigue.
    const entregas = abiertos
      .filter((p) => p.fechaEntrega)
      .slice(0, 8)
      .map((p) => ({
        id: p.id,
        cliente: p.cliente?.nombre || "Sin cliente",
        fechaEntrega: p.fechaEntrega,
        estado: p.estado,
        prioridad: p.prioridad,
        canal: canalDe(p.canalVenta),
        flex: p.etiquetas.includes("flex"),
        itemsCount: p.items.reduce((s, i) => s + i.cantidad, 0),
      }));

    // ─── Cobrado en el mes ────────────────────────────────
    let cobrado = 0;
    let costoFab = 0;
    for (const p of pedidosCompletadosMes) {
      for (const item of p.items) {
        cobrado += item.precioUnitario * item.cantidad + item.ajusteManual;
        costoFab += item.costoUnitario * item.cantidad;
      }
      cobrado += p.precioEnvio;
    }
    // Las cuotas con fecha futura no son gasto del mes todavía (como en Finanzas).
    const gastosEmp = gastosMes
      .filter((g) => g.billetera === "empresarial" && yaOcurrio(g.fecha, ahora))
      .reduce((s, g) => s + g.monto, 0);
    const anioMes = `${inicioMes.getFullYear()}-${String(inicioMes.getMonth() + 1).padStart(2, "0")}`;
    const cargos = (await cargosPorMes(tenantId)).get(anioMes) ?? cargosVacios(inicioMes.getFullYear(), inicioMes.getMonth() + 1);

    // ─── Más vendidos (últimos 30 días) ───────────────────
    const hace30Dias = new Date(ahora.getTime() - 30 * 24 * 60 * 60 * 1000);
    const itemsRecientes = await prisma.itemPedido.findMany({
      where: {
        // Los trabajos a medida no son un modelo: no entran en el ranking.
        modeloId: { not: null },
        pedido: {
          tenantId,
          fechaPedido: { gte: hace30Dias },
          estado: { notIn: ["CANCELADO"] },
        },
      },
      include: {
        modelo: {
          select: {
            nombre: true,
            imagenUrl: true,
            categorias: {
              include: { categoria: true },
            },
          },
        },
      },
    });

    const ventasPorModelo: Record<
      string,
      {
        modeloId: string;
        nombre: string;
        imagenUrl: string | null;
        categorias: NonNullable<(typeof itemsRecientes)[0]["modelo"]>["categorias"];
        totalVendido: number;
        ingresos: number;
      }
    > = {};
    itemsRecientes.forEach((item) => {
      const key = item.modeloId;
      if (!key || !item.modelo) return;
      if (!ventasPorModelo[key]) {
        ventasPorModelo[key] = {
          modeloId: key,
          nombre: item.modelo.nombre,
          imagenUrl: item.modelo.imagenUrl,
          categorias: item.modelo.categorias,
          totalVendido: 0,
          ingresos: 0,
        };
      }
      ventasPorModelo[key].totalVendido += item.cantidad;
      ventasPorModelo[key].ingresos += item.precioUnitario * item.cantidad + item.ajusteManual;
    });

    const modelosTop = Object.values(ventasPorModelo)
      .sort((a, b) => b.totalVendido - a.totalVendido)
      .slice(0, 5);

    const colaDe = (canal: string) => cola.find((c) => c.canal === canal)?._count._all ?? 0;

    return NextResponse.json({
      contadores: {
        pendientesPago: contar("PENDIENTE_PAGO"),
        porDespachar: POR_DESPACHAR.reduce((s, e) => s + contar(e), 0),
        esperandoML: contar("ESPERANDO_LIQUIDACION_ML"),
      },
      despacho,
      entregas,
      finanzasMes: {
        cobrado,
        costoFab,
        margen: cobrado - costoFab,
        // Publicidad, percepciones y otros cargos de ML, sin lo que paga Shay.
        cargosMl: cargos.neto,
        percepcionesEstado: cargos.percepciones.estado,
        gastosEmp,
        neta: cobrado - costoFab - cargos.neto - gastosEmp,
        pedidosCompletados: pedidosCompletadosMes.length,
      },
      billeteraFab: {
        acumulado: billeteraFab.entra + billeteraFab.transferidoHacia,
        gastado: billeteraFab.gastado + billeteraFab.transferidoDesde,
        disponible: billeteraFab.disponible,
      },
      mapeo: {
        colaMl: colaDe("mercadolibre"),
        colaShop: colaDe("shop"),
        pedidosEsperando: esperandoMapeo[0]?.n ?? 0,
      },
      faltaFabricar: {
        piezas: faltante._sum.unidades ?? 0,
        productos: faltante._count._all,
      },
      modelosTop,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
