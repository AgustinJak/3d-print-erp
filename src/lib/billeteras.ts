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

export interface Retirable {
  /** Lo que se puede sacar hoy sin dejar al negocio corto para lo que viene. Nunca negativo. */
  puede: number;
  /** La billetera empresarial, de donde sale. */
  disponible: number;
  /** Gastos y cuotas empresariales de los próximos días. */
  cuotasEmpresariales: number;
  /** Lo que a fabricación le falta para lo suyo de los próximos días (o su negativo). */
  faltaFabricacion: number;
  /** Lo entregado por el repartidor que todavía no se le pagó (docs/sdd/018). */
  repartoAdeudado: number;
  dias: number;
}

/**
 * Cuánto se puede retirar hoy (decisión de Agustín, 2026-11-27: Mercado Pago queda sólo para la
 * empresa y la ganancia se retira a otra cuenta). Es la billetera empresarial menos lo que ya se
 * sabe que va a salir en los próximos `dias`:
 * - los gastos y cuotas empresariales con fecha en ese plazo;
 * - lo que le falte a fabricación para sus cuotas del plazo (si está en negativo, también eso:
 *   lo cubre la empresa);
 * - lo que se le debe al repartidor.
 * Los cargos de ML no van: la billetera ya los descuenta a medida que ML los genera.
 */
export function cuantoSePuedeRetirar(
  empDisponible: number,
  fabDisponible: number,
  gastos: Array<{ fecha: Date; monto: number; billetera: string }>,
  repartoAdeudado: number,
  ahora: Date,
  dias = 30
): Retirable {
  const hasta = new Date(ahora.getTime() + dias * 864e5);
  const proximos = (b: NombreBilletera) =>
    gastos.filter((g) => g.billetera === b && !yaOcurrio(g.fecha, ahora) && g.fecha <= hasta).reduce((s, g) => s + g.monto, 0);
  const cuotasEmpresariales = proximos("empresarial");
  const faltaFabricacion = Math.max(0, proximos("fabricacion") - fabDisponible);
  const puede = Math.max(0, empDisponible - cuotasEmpresariales - faltaFabricacion - repartoAdeudado);
  return { puede, disponible: empDisponible, cuotasEmpresariales, faltaFabricacion, repartoAdeudado, dias };
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
