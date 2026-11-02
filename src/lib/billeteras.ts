import { prisma } from "@/lib/prisma";

/**
 * Las dos billeteras (fabricación y empresarial), con una sola cuenta para Finanzas y el
 * panel. Antes el panel tenía la suya: restaba todos los gastos de las dos billeteras,
 * también las cuotas futuras, y no miraba las transferencias.
 *
 * Lo que entra: a fabricación, el costo de fabricación de cada pedido completado; a
 * empresarial, la ganancia (venta menos ese costo). El disponible sólo cuenta lo que ya
 * pasó: gastos con fecha de hoy o anterior y transferencias ya hechas.
 */

export type NombreBilletera = "fabricacion" | "empresarial";

/**
 * Compara a nivel de día: los gastos se guardan al mediodía local (T12:00) y `ahora`
 * puede ser anterior. Sin esto, un gasto cargado hoy temprano quedaba como futuro.
 */
export function yaOcurrio(fecha: Date, ahora: Date): boolean {
  const inicioDia = (d: Date) => {
    const n = new Date(d);
    n.setHours(0, 0, 0, 0);
    return n.getTime();
  };
  return inicioDia(fecha) <= inicioDia(ahora);
}

export interface SaldoBilletera {
  /** Lo que aportaron los pedidos completados. */
  entra: number;
  /** Gastos de esta billetera con fecha de hoy o anterior. */
  gastado: number;
  /** Todos los gastos de esta billetera, incluidas las cuotas futuras. */
  comprometido: number;
  transferidoHacia: number;
  transferidoDesde: number;
  disponible: number;
}

export function saldoBilletera(
  billetera: NombreBilletera,
  entra: number,
  gastos: Array<{ fecha: Date; monto: number; billetera: string }>,
  transferencias: Array<{ fecha: Date; monto: number; desde: string; hacia: string }>,
  ahora: Date
): SaldoBilletera {
  const propios = gastos.filter((g) => g.billetera === billetera);
  const gastado = propios.filter((g) => yaOcurrio(g.fecha, ahora)).reduce((s, g) => s + g.monto, 0);
  const comprometido = propios.reduce((s, g) => s + g.monto, 0);
  const hechas = transferencias.filter((t) => yaOcurrio(t.fecha, ahora));
  const transferidoHacia = hechas.filter((t) => t.hacia === billetera).reduce((s, t) => s + t.monto, 0);
  const transferidoDesde = hechas.filter((t) => t.desde === billetera).reduce((s, t) => s + t.monto, 0);
  return {
    entra,
    gastado,
    comprometido,
    transferidoHacia,
    transferidoDesde,
    disponible: entra + transferidoHacia - gastado - transferidoDesde,
  };
}

/** La billetera de fabricación leída de la base, para quien no tiene ya los datos cargados. */
export async function billeteraFabricacion(tenantId: string, ahora = new Date()): Promise<SaldoBilletera> {
  const [costo, gastos, transferencias] = await Promise.all([
    prisma.$queryRaw<Array<{ costo: number | null }>>`
      SELECT SUM(i.costo_unitario * i.cantidad)::float8 AS costo
      FROM items_pedido i JOIN pedidos p ON p.id = i.pedido_id
      WHERE p.tenant_id = ${tenantId} AND p.estado = 'COMPLETADO'
    `,
    prisma.gasto.findMany({ where: { tenantId, billetera: "fabricacion" }, select: { fecha: true, monto: true, billetera: true } }),
    prisma.transferencia.findMany({ where: { tenantId }, select: { fecha: true, monto: true, desde: true, hacia: true } }),
  ]);
  return saldoBilletera("fabricacion", costo[0]?.costo ?? 0, gastos, transferencias, ahora);
}
