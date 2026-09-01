import { prisma } from "@/lib/prisma";
import { getMlAccount, searchOrders, type MlOrder } from "@/lib/mercadolibre";
import type { Prisma } from "@/generated/prisma";

/**
 * Ventas de Shay Juguetes en la cuenta de Mercado Libre compartida.
 *
 * Las publicaciones marcadas `ignorar` son de ese negocio: el ERP no les crea
 * pedido, pero la plata entra a la misma cuenta y hay que pasársela. Esto
 * reconstruye el mes desde la API de ML y guarda el cierre.
 *
 * Se guarda calculado porque son ~5 llamadas a ML por mes: demasiado lento para
 * rehacerlo en cada carga de Finanzas.
 */

export const SOCIO_SHAY = "shayjuguetes";

export interface PedidoTercero {
  idMl: string;          // id de la orden en ML
  packId: string | null; // compra, cuando el comprador llevó varias cosas juntas
  fecha: string;         // ISO
  estado: string;
  mla: string;
  titulo: string;
  cantidad: number;
  precioUnitario: number;
  bruto: number;         // precioUnitario × cantidad
  comision: number;      // lo que se llevó ML
  neto: number;
  comprador: string | null;
}

export interface CierreTercero {
  socio: string;
  anio: number;
  mes: number;
  unidades: number;
  bruto: number;
  comision: number;
  neto: number;
  pedidos: PedidoTercero[];
  calculadoEn: string;
}

/** Primer y último instante del mes, en hora argentina. */
function rangoDelMes(anio: number, mes: number): { desde: string; hasta: string } {
  const dosDig = (n: number) => String(n).padStart(2, "0");
  const finAnio = mes === 12 ? anio + 1 : anio;
  const finMes = mes === 12 ? 1 : mes + 1;
  return {
    desde: `${anio}-${dosDig(mes)}-01T00:00:00.000-03:00`,
    hasta: `${finAnio}-${dosDig(finMes)}-01T00:00:00.000-03:00`,
  };
}

/**
 * Recalcula el mes desde Mercado Libre y lo guarda.
 *
 * Las canceladas quedan afuera: no son plata que haya que pasar. Todo lo demás
 * se toma tal cual lo informa ML, sin estimar nada.
 */
export async function calcularCierreTercero(
  tenantId: string,
  anio: number,
  mes: number,
  socio = SOCIO_SHAY
): Promise<CierreTercero | null> {
  const cuenta = await getMlAccount(tenantId);
  if (!cuenta) return null;

  const ignoradas = await prisma.publicacionMl.findMany({
    where: { tenantId, ignorar: true },
    select: { mla: true },
  });
  const esDelSocio = new Set(ignoradas.map((p) => p.mla));

  const { desde, hasta } = rangoDelMes(anio, mes);

  const ordenes: MlOrder[] = [];
  let offset = 0;
  let total = Infinity;
  while (offset < total) {
    const r = await searchOrders(tenantId, {
      sellerId: cuenta.mlUserId,
      from: desde,
      to: hasta,
      offset,
      limit: 50,
    });
    total = r.paging.total;
    if (r.results.length === 0) break;
    ordenes.push(...r.results);
    offset += 50;
  }

  const pedidos: PedidoTercero[] = [];
  for (const o of ordenes) {
    if (o.status === "cancelled") continue;
    for (const it of o.order_items) {
      if (!esDelSocio.has(it.item.id)) continue;
      const bruto = it.unit_price * it.quantity;
      const comision = (it.sale_fee ?? 0) * it.quantity;
      pedidos.push({
        idMl: String(o.id),
        packId: o.pack_id != null ? String(o.pack_id) : null,
        fecha: o.date_created,
        estado: o.status,
        mla: it.item.id,
        titulo: it.item.title,
        cantidad: it.quantity,
        precioUnitario: it.unit_price,
        bruto,
        comision,
        neto: bruto - comision,
        comprador: o.buyer?.nickname ?? null,
      });
    }
  }

  pedidos.sort((a, b) => a.fecha.localeCompare(b.fecha));

  const totales = pedidos.reduce(
    (acc, p) => ({
      unidades: acc.unidades + p.cantidad,
      bruto: acc.bruto + p.bruto,
      comision: acc.comision + p.comision,
      neto: acc.neto + p.neto,
    }),
    { unidades: 0, bruto: 0, comision: 0, neto: 0 }
  );

  const fila = await prisma.ventaTercero.upsert({
    where: { tenantId_socio_anio_mes: { tenantId, socio, anio, mes } },
    create: {
      tenantId,
      socio,
      anio,
      mes,
      ...totales,
      pedidos: pedidos as unknown as Prisma.InputJsonValue,
    },
    update: { ...totales, pedidos: pedidos as unknown as Prisma.InputJsonValue },
  });

  return {
    socio,
    anio,
    mes,
    ...totales,
    pedidos,
    calculadoEn: fila.calculadoEn.toISOString(),
  };
}

/** El cierre ya guardado, si existe. No llama a ML. */
export async function leerCierreTercero(
  tenantId: string,
  anio: number,
  mes: number,
  socio = SOCIO_SHAY
): Promise<CierreTercero | null> {
  const fila = await prisma.ventaTercero.findUnique({
    where: { tenantId_socio_anio_mes: { tenantId, socio, anio, mes } },
  });
  if (!fila) return null;
  return {
    socio: fila.socio,
    anio: fila.anio,
    mes: fila.mes,
    unidades: fila.unidades,
    bruto: fila.bruto,
    comision: fila.comision,
    neto: fila.neto,
    pedidos: (fila.pedidos ?? []) as unknown as PedidoTercero[],
    calculadoEn: fila.calculadoEn.toISOString(),
  };
}
