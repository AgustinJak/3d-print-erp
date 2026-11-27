import { prisma } from "@/lib/prisma";
import { getValidAccessToken } from "@/lib/mercadolibre";
import { cargosPorMes } from "@/lib/resultado-mes";
import { calcularCierreTercero, leerCierreTercero } from "@/lib/ventas-terceros";
import { hoyEnArgentina } from "@/lib/temas";

/**
 * Cuánto se puede retirar de Mercado Pago (docs/sdd/019). Mercado Pago es sólo de la empresa
 * (decisión de Agustín, 2026-11-27) y la ganancia se pasa a una cuenta personal.
 *
 * Parte de la plata que hay de verdad, no de la billetera: la billetera es la ganancia acumulada,
 * arrancó en cero el 1/11 y no ve lo de octubre que se pagó en noviembre ni la plata de Shay. Al saldo
 * se le resta lo que ya se sabe que va a salir:
 *   - lo de Shay de los meses que no se le pagaron (desde octubre de 2026);
 *   - los resúmenes de la tarjeta sin pagar, enteros: lo personal lo deposita cada socio, y cuando lo
 *     deposita sube el saldo;
 *   - lo que va a facturar ML: el mes en curso y, hasta el 12, el anterior (se cobra a principio de mes);
 *   - los gastos con fecha en los próximos 30 días que no son cuotas (las cuotas van en la tarjeta);
 *   - lo que se le debe al repartidor.
 * No suma lo que falta liberar: hasta que se libera no se puede retirar.
 */

const SHAY_DESDE = { anio: 2026, mes: 10 };
const DIAS = 30;
const API = "https://api.mercadopago.com/v1/account/release_report";

// ─── El saldo ───────────────────────────────────────────────────────────

/** El saldo y la hora del último movimiento, de un reporte de liberaciones (CSV con `;`). */
export function saldoDelReporte(csv: string): { saldo: number; al: string } | null {
  const lineas = csv.trim().split(/\r?\n/);
  const cab = (lineas[0] ?? "").split(";");
  const iFecha = cab.indexOf("DATE");
  const iSaldo = cab.indexOf("BALANCE_AMOUNT");
  if (iFecha < 0 || iSaldo < 0) return null;
  let ultimo: { saldo: number; al: string } | null = null;
  for (const l of lineas.slice(1)) {
    const c = l.split(";");
    // La última línea es el total del reporte: sin fecha y con saldo 0.
    if (!c[iFecha]) continue;
    const saldo = Number(c[iSaldo]);
    if (Number.isFinite(saldo)) ultimo = { saldo, al: c[iFecha] };
  }
  return ultimo;
}

/**
 * Pide a Mercado Pago un reporte de liberaciones de los últimos 3 días, espera a que esté (1 o 2
 * minutos) y guarda el saldo. La API no da el saldo en el momento: se probó el 2026-11-27.
 */
export async function leerSaldoMp(tenantId: string, hastaMs = 240_000): Promise<{ saldo: number; al: string } | { error: string }> {
  const token = await getValidAccessToken(tenantId);
  const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const fin = new Date();
  const inicio = new Date(fin.getTime() - 3 * 864e5);
  const pedido = await fetch(API, { method: "POST", headers: H, body: JSON.stringify({ begin_date: inicio.toISOString().slice(0, 19) + "Z", end_date: fin.toISOString().slice(0, 19) + "Z" }) });
  if (!pedido.ok) return { error: `Mercado Pago no generó el reporte (${pedido.status})` };
  // La lista usa otro id que el que devuelve el pedido, y redondea las fechas al día: se reconoce por
  // ser el más nuevo creado después de pedirlo (con un minuto de margen por los relojes).
  const pedidoEn = fin.getTime() - 60_000;

  const limite = Date.now() + hastaMs;
  while (Date.now() < limite) {
    await new Promise((r) => setTimeout(r, 8000));
    const lista = (await (await fetch(`${API}/list`, { headers: H })).json().catch(() => [])) as Array<{ file_name?: string; date_created?: string; created_from?: string }>;
    const listo = (Array.isArray(lista) ? lista : [])
      .filter((x) => x.file_name && x.created_from === "manual" && new Date(x.date_created ?? 0).getTime() >= pedidoEn)
      .sort((a, b) => new Date(b.date_created!).getTime() - new Date(a.date_created!).getTime())[0];
    if (!listo?.file_name) continue;
    const csv = await (await fetch(`${API}/${listo.file_name}`, { headers: H })).text();
    const s = saldoDelReporte(csv);
    if (!s) return { error: "El reporte de Mercado Pago vino sin saldo" };
    await prisma.saldoMp.create({ data: { tenantId, saldo: s.saldo, al: new Date(s.al), reporte: listo.file_name } });
    return s;
  }
  return { error: "Mercado Pago todavía no terminó el reporte. Probá de nuevo en un minuto." };
}

// ─── Shay ───────────────────────────────────────────────────────────────

const mesesDesde = (desde: { anio: number; mes: number }, hasta: { anio: number; mes: number }) => {
  const out: Array<{ anio: number; mes: number }> = [];
  for (let a = desde.anio, m = desde.mes; a < hasta.anio || (a === hasta.anio && m <= hasta.mes); m === 12 ? (a++, (m = 1)) : m++) out.push({ anio: a, mes: m });
  return out;
};

/** Recalcula el cierre de Shay de los meses sin pagar que no lo tienen o que son el mes en curso. */
export async function actualizarShaySinPagar(tenantId: string): Promise<void> {
  const [a, m] = hoyEnArgentina().split("-").map(Number);
  for (const x of mesesDesde(SHAY_DESDE, { anio: a, mes: m })) {
    const fila = await prisma.ventaTercero.findUnique({ where: { tenantId_socio_anio_mes: { tenantId, socio: "shayjuguetes", anio: x.anio, mes: x.mes } }, select: { pagadoEn: true } });
    if (fila?.pagadoEn) continue;
    if (!fila || (x.anio === a && x.mes === m)) await calcularCierreTercero(tenantId, x.anio, x.mes);
  }
}

// ─── La cuenta ──────────────────────────────────────────────────────────

export interface Retiro {
  saldo: { monto: number; al: string; leidoEn: string } | null;
  shay: { total: number; meses: Array<{ anio: number; mes: number; aPasar: number | null }> };
  tarjeta: { total: number; resumenes: Array<{ id: string; cierre: string; vencimiento: string; total: number; partes: ParteTarjeta[] }> };
  ml: { total: number; meses: Array<{ mes: string; monto: number }> };
  gastos: number;
  reparto: number;
  /** Lo que se puede retirar. Negativo = falta plata para lo que viene. */
  puede: number;
  dias: number;
}

export interface ParteTarjeta {
  socio: string;
  monto: number;
  depositado?: boolean;
}

export async function calcularRetirable(tenantId: string, ahora = new Date()): Promise<Retiro> {
  const hoy = hoyEnArgentina(ahora);
  const [a, m, d] = hoy.split("-").map(Number);

  const ultimo = await prisma.saldoMp.findFirst({ where: { tenantId }, orderBy: { leidoEn: "desc" } });

  // Shay: los meses desde octubre que no se le pagaron.
  const mesesShay = [];
  for (const x of mesesDesde(SHAY_DESDE, { anio: a, mes: m })) {
    const fila = await prisma.ventaTercero.findUnique({ where: { tenantId_socio_anio_mes: { tenantId, socio: "shayjuguetes", anio: x.anio, mes: x.mes } }, select: { pagadoEn: true } });
    if (fila?.pagadoEn) continue;
    const cierre = fila ? await leerCierreTercero(tenantId, x.anio, x.mes) : null;
    mesesShay.push({ ...x, aPasar: cierre ? Math.max(0, cierre.aPasar) : null });
  }

  // La tarjeta: los resúmenes sin pagar, enteros.
  const resumenes = await prisma.resumenTarjeta.findMany({ where: { tenantId, pagado: false }, orderBy: { cierre: "asc" } });

  // ML: lo que factura (con la parte de Shay: la paga la cuenta y se le descuenta a ella).
  const cargos = await cargosPorMes(tenantId);
  const clave = (anio: number, mes: number) => `${anio}-${String(mes).padStart(2, "0")}`;
  const mesesMl = [clave(a, m)];
  if (d <= 12) mesesMl.unshift(m === 1 ? clave(a - 1, 12) : clave(a, m - 1));
  const ml = mesesMl.map((mm) => {
    const c = cargos.get(mm);
    return { mes: mm, monto: c ? c.publicidad.total + c.percepciones.total + c.otros.total : 0 };
  });

  // Gastos con fecha en los próximos 30 días que no son cuotas.
  const hasta = new Date(ahora.getTime() + DIAS * 864e5);
  const futuros = await prisma.gasto.aggregate({ where: { tenantId, grupoCuotasId: null, fecha: { gt: ahora, lte: hasta } }, _sum: { monto: true } });

  const reparto = await prisma.envioReparto.aggregate({ where: { tenantId, estado: "entregado", liquidacionId: null }, _sum: { precio: true } });

  const shayTotal = mesesShay.reduce((s, x) => s + (x.aPasar ?? 0), 0);
  const tarjetaTotal = resumenes.reduce((s, r) => s + r.total, 0);
  const mlTotal = ml.reduce((s, x) => s + x.monto, 0);
  const gastos = futuros._sum.monto ?? 0;
  const repartoTotal = Number(reparto._sum.precio ?? 0);
  const saldo = ultimo ? ultimo.saldo : 0;

  return {
    saldo: ultimo ? { monto: ultimo.saldo, al: ultimo.al.toISOString(), leidoEn: ultimo.leidoEn.toISOString() } : null,
    shay: { total: shayTotal, meses: mesesShay },
    tarjeta: {
      total: tarjetaTotal,
      resumenes: resumenes.map((r) => ({ id: r.id, cierre: r.cierre.toISOString().slice(0, 10), vencimiento: r.vencimiento.toISOString().slice(0, 10), total: r.total, partes: (r.partes ?? []) as unknown as ParteTarjeta[] })),
    },
    ml: { total: mlTotal, meses: ml },
    gastos,
    reparto: repartoTotal,
    puede: saldo - shayTotal - tarjetaTotal - mlTotal - gastos - repartoTotal,
    dias: DIAS,
  };
}
