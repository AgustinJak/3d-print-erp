import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { conCuentaMl, cuentasMl, getValidAccessToken, mlFetch } from "@/lib/mercadolibre";

/**
 * Lo que entra de verdad por cada venta de ML, y las bonificaciones Flex (docs/sdd/007).
 *
 * El precio de cada línea de un pedido de ML es el neto de la venta. Hasta acá salía de una cuenta
 * hecha segundos después de la venta (precio − comisión − envío), que no se volvía a mirar: 149
 * ventas quedaron con comisión $0 y ML les había cobrado $608.588. Tampoco veía los cupones, las
 * retenciones ni el envío que paga el comprador y entra al vendedor.
 *
 * Ahora el número es el de Mercado Pago, `net_received_amount`, menos el envío a cargo del vendedor
 * que no se descontó en ese pago. Se vuelve a leer hasta que MP libera la plata.
 */

const POR_TANDA = 8;

interface OrdenMl {
  order_items?: Array<{ unit_price?: number; quantity?: number; sale_fee?: number; item?: { id?: string } }>;
  shipping?: { id?: number | string };
  payments?: Array<{ id: number | string; status?: string }>;
}
interface PagoMp {
  transaction_details?: { net_received_amount?: number };
  transaction_amount_refunded?: number;
  money_release_status?: string;
  charges_details?: Array<{ name?: string; type?: string; amounts?: { original?: number } }>;
}
interface MovimientoMp {
  id: number | string;
  description?: string;
  status?: string;
  collector_id?: number | string;
  collector?: { id?: number | string };
  date_created?: string;
  transaction_amount?: number;
  point_of_interaction?: { transaction_data?: { reference_id?: string } };
}

export interface NetoReal {
  bruto: number;
  /** Lo que ML cobra por línea de esta venta: precio de lista por publicación. */
  brutoPorMla: Map<string, number>;
  comision: number;
  cupon: number;
  retencion: number;
  envio: number;
  neto: number;
  /** MP ya liberó la plata de todos los pagos: el número no cambia más. */
  liberado: boolean;
}

async function pagoDeMp(token: string, id: string | number): Promise<PagoMp | null> {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.status === 429) {
      await new Promise((res) => setTimeout(res, 3000));
      continue;
    }
    return r.ok ? ((await r.json()) as PagoMp) : null;
  }
  return null;
}

/** `null` si no hay ningún pago aprobado que leer, o si ML o MP no contestaron. */
export async function leerNetoReal(tenantId: string, orderIds: string[]): Promise<NetoReal | null> {
  const token = await getValidAccessToken(tenantId);
  const out: NetoReal = { bruto: 0, brutoPorMla: new Map(), comision: 0, cupon: 0, retencion: 0, envio: 0, neto: 0, liberado: true };
  const pagos = new Set<string>();
  const envios = new Set<string>();

  for (const id of orderIds) {
    const o = await mlFetch<OrdenMl>(tenantId, `/orders/${id}`).catch(() => null);
    if (!o) return null;
    for (const it of o.order_items ?? []) {
      const linea = (it.unit_price || 0) * (it.quantity || 0);
      out.bruto += linea;
      out.comision += (it.sale_fee || 0) * (it.quantity || 0);
      const mla = String(it.item?.id ?? "");
      out.brutoPorMla.set(mla, (out.brutoPorMla.get(mla) ?? 0) + linea);
    }
    if (o.shipping?.id) envios.add(String(o.shipping.id));
    for (const p of o.payments ?? []) if (p.status === "approved") pagos.add(String(p.id));
  }
  if (pagos.size === 0) return null;

  let recibido = 0;
  let envioEnPago = 0;
  for (const id of pagos) {
    const d = await pagoDeMp(token, id);
    if (!d) return null;
    recibido += (d.transaction_details?.net_received_amount || 0) - (d.transaction_amount_refunded || 0);
    if (d.money_release_status !== "released") out.liberado = false;
    for (const c of d.charges_details ?? []) {
      const m = c.amounts?.original || 0;
      if (/^shp_|ship/i.test(String(c.name))) envioEnPago += m;
      else if (/tax_withholding/.test(String(c.name)) || c.type === "tax") out.retencion += m;
      else if (/coupon_fee/.test(String(c.name))) out.cupon += m;
    }
  }

  let aCargoDelVendedor = 0;
  for (const id of envios) {
    const c = await mlFetch<{ senders?: Array<{ cost?: number }> }>(tenantId, `/shipments/${id}/costs`).catch(() => null);
    if (!c) return null;
    for (const s of c.senders ?? []) aCargoDelVendedor += s.cost || 0;
  }
  // Si el pago ya descontó el envío no se resta otra vez: ML a veces lo cobra ahí y a veces aparte.
  out.envio = aCargoDelVendedor;
  out.neto = recibido - Math.max(0, aCargoDelVendedor - envioEnPago);
  return out;
}

const DESGLOSE = "💰 Desglose ML:";
const $ = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;

type PedidoAReleer = {
  id: string;
  notas: string | null;
  origenExterno: Prisma.JsonValue;
  items: Array<{ id: string; precioUnitario: number; cantidad: number; mlaOrigen: string | null }>;
};

/**
 * Lleva el neto real a las líneas del pedido. Si el paquete tiene productos de otro (Shay), al
 * pedido le toca su parte por lo que vale cada uno, como el envío en el cierre de Shay: ML no
 * separa el pago. Devuelve cuánto cambió lo cobrado.
 */
export async function aplicarNetoReal(p: PedidoAReleer, r: NetoReal): Promise<number> {
  const mlas = new Set(p.items.map((i) => i.mlaOrigen).filter(Boolean) as string[]);
  const brutoPropio = mlas.size ? [...r.brutoPorMla].filter(([m]) => mlas.has(m)).reduce((s, [, v]) => s + v, 0) : r.bruto;
  const parte = r.bruto > 0 && brutoPropio > 0 ? brutoPropio / r.bruto : 1;
  const netoPropio = r.neto * parte;
  const antes = p.items.reduce((s, i) => s + i.precioUnitario * i.cantidad, 0);
  if (antes <= 0) return 0;

  const oe = (p.origenExterno ?? {}) as Record<string, unknown>;
  const notasBase = (p.notas || "").split(`\n\n${DESGLOSE}`)[0].split(`\n${DESGLOSE}`)[0].trimEnd();
  const desglose = [
    DESGLOSE,
    `  Precio productos: ${$(r.bruto)}`,
    `  Comisión ML: -${$(r.comision)}`,
    ...(r.cupon ? [`  Cupón: -${$(r.cupon)}`] : []),
    ...(r.retencion ? [`  Retenciones: -${$(r.retencion)}`] : []),
    `  Envío (vendedor): -${$(r.envio)}`,
    `  Recibido según Mercado Pago: ${$(r.neto)}`,
    ...(parte < 1 ? [`  De este pedido (${Math.round(parte * 100)} % del paquete): ${$(netoPropio)}`] : []),
  ].join("\n");

  const factor = netoPropio / antes;
  await prisma.$transaction([
    ...p.items.map((i) =>
      prisma.itemPedido.update({ where: { id: i.id }, data: { precioUnitario: Math.round(i.precioUnitario * factor * 100) / 100 } })
    ),
    prisma.pedido.update({
      where: { id: p.id },
      data: {
        notas: `${notasBase}\n\n${desglose}`,
        origenExterno: {
          ...oe,
          costos_ml: {
            precio_productos: r.bruto,
            comision: r.comision,
            cupon: r.cupon,
            retencion: r.retencion,
            envio: r.envio,
            neto: r.neto,
            fuente: "mercadopago",
            liberado: r.liberado,
            leido_en: new Date().toISOString(),
          },
        } as Prisma.InputJsonValue,
      },
    }),
  ]);
  return netoPropio - antes;
}

export interface ResultadoNetos {
  revisados: number;
  corregidos: number;
  diferencia: number;
  quedan: boolean;
}

/**
 * Relee las ventas cuyo neto todavía puede cambiar: las que no salieron de Mercado Pago, o las que
 * MP no liberó. Las más nuevas primero. Corta al terminarse el tiempo y sigue en la pasada siguiente.
 */
export async function revisarNetos(tenantId: string, opts: { hasta: number; desde?: Date }): Promise<ResultadoNetos> {
  const out: ResultadoNetos = { revisados: 0, corregidos: 0, diferencia: 0, quedan: false };
  const pendientes = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM public.pedidos
    WHERE tenant_id = ${tenantId} AND canal_venta = 'mercadolibre' AND estado <> 'CANCELADO'::"EstadoPedido"
      AND fecha_pedido >= ${opts.desde ?? new Date(Date.now() - 60 * 864e5)}
      AND COALESCE((origen_externo->'costos_ml'->>'liberado')::boolean, false) = false
    ORDER BY fecha_pedido DESC
  `;
  for (let i = 0; i < pendientes.length; i += POR_TANDA) {
    if (Date.now() > opts.hasta) {
      out.quedan = true;
      break;
    }
    const tanda = await prisma.pedido.findMany({
      where: { id: { in: pendientes.slice(i, i + POR_TANDA).map((p) => p.id) } },
      select: { id: true, notas: true, origenExterno: true, items: { select: { id: true, precioUnitario: true, cantidad: true, mlaOrigen: true } } },
    });
    await Promise.all(
      tanda.map(async (p) => {
        const oe = (p.origenExterno ?? {}) as { order_ids?: string[]; cuenta_ml?: string | null };
        const ids = oe.order_ids ?? [];
        if (!ids.length) return;
        // Con la cuenta de la venta: el pago de Sendero Shop está en el Mercado Pago de esa cuenta.
        const r = await conCuentaMl(oe.cuenta_ml ?? null, () => leerNetoReal(tenantId, ids)).catch(() => null);
        if (!r) return;
        const dif = await aplicarNetoReal(p, r);
        out.revisados++;
        if (Math.abs(dif) > 1) {
          out.corregidos++;
          out.diferencia += dif;
        }
      })
    );
  }
  return out;
}

/**
 * Trae las bonificaciones Flex que entraron a Mercado Pago, y marca de qué pedido es cada una: la
 * transferencia dice el envío, y el envío dice la venta. La que no es de ningún pedido del ERP
 * queda aparte, porque no es de Sendero.
 */
export async function sincronizarFlex(tenantId: string, opts: { hasta: number; desdeMes?: string }): Promise<{ nuevas: number; quedan: boolean }> {
  // Cada cuenta de ML cobra en su Mercado Pago (docs/sdd/010 y 011).
  let nuevas = 0;
  for (const c of await cuentasMl(tenantId)) {
    const r = await flexDeCuenta(tenantId, { id: c.principal ? null : c.id, mlUserId: c.mlUserId }, opts);
    nuevas += r.nuevas;
    if (r.quedan) return { nuevas, quedan: true };
  }
  return { nuevas, quedan: false };
}

async function flexDeCuenta(tenantId: string, cuenta: { id: string | null; mlUserId: number | string }, opts: { hasta: number; desdeMes?: string }): Promise<{ nuevas: number; quedan: boolean }> {
  const yo = String(cuenta.mlUserId);
  const token = await getValidAccessToken(tenantId, cuenta.id);

  const ahora = new Date();
  const inicio = opts.desdeMes ? new Date(`${opts.desdeMes}-01T12:00:00Z`) : new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() - 1, 1, 12));
  let nuevas = 0;
  for (let m = new Date(inicio); m <= ahora; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1, 12))) {
    const mm = m.toISOString().slice(0, 7);
    const fin = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    for (let offset = 0; offset < 5000; offset += 100) {
      if (Date.now() > opts.hasta) return { nuevas, quedan: true };
      const r = await fetch(
        `https://api.mercadopago.com/v1/payments/search?sort=date_created&criteria=asc&range=date_created&begin_date=${mm}-01T00:00:00.000-03:00&end_date=${fin}T23:59:59.000-03:00&limit=100&offset=${offset}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!r.ok) return { nuevas, quedan: true };
      const j = (await r.json()) as { results?: MovimientoMp[] };
      const filas: Prisma.FlexMlCreateManyInput[] = [];
      for (const x of j.results ?? []) {
        if (!/flex/i.test(String(x.description)) || x.status !== "approved") continue;
        if (String(x.collector_id ?? x.collector?.id) !== yo) continue;
        const f = String(x.date_created);
        filas.push({
          pagoId: String(x.id),
          tenantId,
          fecha: new Date(f),
          dia: new Date(new Date(f).getTime() - 3 * 36e5).toISOString().slice(0, 10),
          monto: x.transaction_amount || 0,
          envioId: x.point_of_interaction?.transaction_data?.reference_id ?? null,
          cuentaMlId: cuenta.id,
        });
      }
      if (filas.length) nuevas += (await prisma.flexMl.createMany({ data: filas, skipDuplicates: true })).count;
      if ((j.results?.length ?? 0) < 100) break;
    }
  }

  // De qué pedido es cada una.
  const sinVer = await prisma.flexMl.findMany({ where: { tenantId, revisado: false, cuentaMlId: cuenta.id }, select: { pagoId: true, envioId: true } });
  if (sinVer.length) {
    const pedidos = await prisma.pedido.findMany({ where: { tenantId, canalVenta: "mercadolibre" }, select: { id: true, origenExterno: true } });
    const porOrden = new Map<string, string>();
    for (const p of pedidos) for (const o of ((p.origenExterno ?? {}) as { order_ids?: string[] }).order_ids ?? []) porOrden.set(String(o), p.id);
    for (let i = 0; i < sinVer.length; i += POR_TANDA) {
      if (Date.now() > opts.hasta) return { nuevas, quedan: true };
      await Promise.all(
        sinVer.slice(i, i + POR_TANDA).map(async (f) => {
          if (!f.envioId) return;
          const e = await mlFetch<{ order_id?: number }>(tenantId, `/shipments/${f.envioId}`, { cuenta: cuenta.id }).catch(() => null);
          if (!e?.order_id) return;
          const pedidoId = porOrden.get(String(e.order_id)) ?? null;
          await prisma.flexMl.update({ where: { pagoId: f.pagoId }, data: { pedidoId, deOtro: !pedidoId, revisado: true } });
        })
      );
    }
  }
  return { nuevas, quedan: false };
}
