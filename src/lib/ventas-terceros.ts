import { prisma } from "@/lib/prisma";
import { getMlAccount, getShipmentCosts, searchOrders, type MlOrder } from "@/lib/mercadolibre";
import type { Prisma } from "@/generated/prisma";

/**
 * Reparto de la cuenta de Mercado Libre compartida con Shay Juguetes.
 *
 * Las publicaciones marcadas `ignorar` son de Shay: el ERP no les crea pedido,
 * pero la plata entra a la misma cuenta y hay que pasársela. Esto reconstruye
 * el mes desde la API de ML — los dos lados en la misma pasada — y guarda el
 * cierre.
 *
 * Cómo se reparte cada cosa (desde el 2026-11-02):
 *
 *   comisión de ML   directo, por venta: ML ya la cobra sobre cada item
 *   envío            directo, por envío: lo que ML le cobra al vendedor
 *                    (envío gratis); en un paquete con cosas de los dos, por bruto
 *   publicidad       directo, por campaña: se sabe de quién es cada una
 *   percepciones     prorrateado por bruto sobre todas las ventas del mes
 *   convenio         fijo: lo que paga Shay, que Agustín calcula afuera con las
 *                    facturas (desde el 2026-11-12). Los meses que no lo tienen
 *                    cargado (`iibbSocio` null) reparten el total como antes.
 *   monotributo      prorrateado por bruto sobre todas las ventas del mes
 *
 * Lo prorrateado se carga una sola vez con el total del mes
 * (`GastoCompartido`) y cada tienda se hace cargo de lo que le toca según
 * cuánto vendió. Nadie carga dos veces el mismo número.
 *
 * Por qué bruto y todas las ventas: esos impuestos son del CUIT entero y se
 * calculan sobre lo vendido, no sobre lo que queda después de la comisión. Las
 * ventas de Sendero fuera de ML (la web, las de a mano) también los generan.
 * Hasta el 2026-11-02 se prorrateaba por neto contra las ventas de ML solas, y
 * el envío no se descontaba: lo absorbía Sendero.
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
  neto: number;          // bruto − comisión
  envio?: number;        // su parte de lo que ML cobró por el envío (cierres desde 2026-11-02)
  comprador: string | null;
}

/** Los gastos del mes que no son de una tienda sola. Total, sin repartir. */
export interface GastosCompartidos {
  percepciones: number;
  iibb: number;         // convenio multilateral, total de la cuenta (meses de antes)
  iibbSocio: number | null; // convenio que paga el socio, fijo; null = repartir `iibb`
  monotributo: number;
  notas: string | null;
}

export const CAMPOS_COMPARTIDOS = ["percepciones", "iibb", "monotributo"] as const;
export type CampoCompartido = (typeof CAMPOS_COMPARTIDOS)[number];

export interface CierreTercero {
  socio: string;
  anio: number;
  mes: number;

  // el socio
  unidades: number;
  bruto: number;
  comision: number;
  neto: number;         // bruto − comisión de ML
  envio: number;        // lo que ML cobró por sus envíos, imputación directa

  // el otro lado de la cuenta, para poder repartir
  unidadesPropias: number;
  brutoPropio: number;
  netoPropio: number;
  brutoOtros: number;   // ventas de Sendero fuera de ML en el mes (pedidos del ERP)

  proporcion: number;   // bruto del socio sobre el bruto de todas las ventas (0 a 1)

  publicidad: number;   // sus campañas, imputación directa
  compartidos: GastosCompartidos;   // totales del mes, sin repartir
  parteCompartidos: number;         // lo que le toca de esos totales
  aPasar: number;       // neto − envío − publicidad − parteCompartidos

  notas: string | null;
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
 * Recorre las órdenes una sola vez y separa lo de Shay de lo de Sendero, porque
 * la proporción entre los dos es lo que después reparte los gastos.
 *
 * Las canceladas quedan afuera: no son plata que haya que pasar. No pisa la
 * publicidad ya cargada.
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
  const propio = { unidadesPropias: 0, brutoPropio: 0, comisionPropia: 0, netoPropio: 0 };

  for (const o of ordenes) {
    if (o.status === "cancelled") continue;
    for (const it of o.order_items) {
      const bruto = it.unit_price * it.quantity;
      const comision = (it.sale_fee ?? 0) * it.quantity;

      if (!esDelSocio.has(it.item.id)) {
        propio.unidadesPropias += it.quantity;
        propio.brutoPropio += bruto;
        propio.comisionPropia += comision;
        propio.netoPropio += bruto - comision;
        continue;
      }

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

  // El envío que paga el vendedor (envío gratis) sale de la cuenta compartida:
  // cada uno se hace cargo del de sus ventas. Hay un envío por paquete; si el
  // paquete lleva cosas de los dos, se reparte por bruto.
  const brutoPorEnvio = new Map<number, number>();
  const envioDe = new Map<string, number>(); // id de orden → id de envío
  for (const o of ordenes) {
    const sid = o.shipping?.id;
    if (o.status === "cancelled" || !sid) continue;
    envioDe.set(String(o.id), sid);
    brutoPorEnvio.set(sid, (brutoPorEnvio.get(sid) ?? 0) + o.order_items.reduce((a, it) => a + it.unit_price * it.quantity, 0));
  }
  const envios = [...new Set(pedidos.flatMap((p) => envioDe.get(p.idMl) ?? []))];
  const costoDe = await costosDeEnvio(tenantId, envios);
  for (const p of pedidos) {
    const sid = envioDe.get(p.idMl);
    const total = sid != null ? (brutoPorEnvio.get(sid) ?? 0) : 0;
    p.envio = sid != null && total > 0 ? (costoDe.get(sid) ?? 0) * (p.bruto / total) : 0;
  }
  const brutoOtros = await ventasFueraDeMl(tenantId, desde, hasta);

  const totales = pedidos.reduce(
    (acc, p) => ({
      unidades: acc.unidades + p.cantidad,
      bruto: acc.bruto + p.bruto,
      comision: acc.comision + p.comision,
      neto: acc.neto + p.neto,
      envio: acc.envio + (p.envio ?? 0),
    }),
    { unidades: 0, bruto: 0, comision: 0, neto: 0, envio: 0 }
  );

  const fila = await prisma.ventaTercero.upsert({
    where: { tenantId_socio_anio_mes: { tenantId, socio, anio, mes } },
    create: {
      tenantId,
      socio,
      anio,
      mes,
      ...totales,
      ...propio,
      brutoOtros,
      pedidos: pedidos as unknown as Prisma.InputJsonValue,
    },
    update: { ...totales, ...propio, brutoOtros, pedidos: pedidos as unknown as Prisma.InputJsonValue },
  });

  return armarCierre(fila, pedidos, await leerCompartidos(tenantId, anio, mes));
}

/**
 * Lo que ML le cobró al vendedor por cada envío (`senders[].cost`, ya con las
 * bonificaciones). De a 10 y con un reintento; un envío que no se puede leer
 * corta el cálculo: mejor no guardar el cierre que guardarlo con un envío en cero.
 */
async function costosDeEnvio(tenantId: string, ids: number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  const leer = async (sid: number): Promise<number> => {
    try {
      const c = await getShipmentCosts(tenantId, sid).catch(() => getShipmentCosts(tenantId, sid));
      return (c.senders ?? []).reduce((a, x) => a + (x.cost ?? 0), 0);
    } catch (e) {
      throw new Error(`No se pudo leer el costo del envío ${sid} en ML: ${e instanceof Error ? e.message : e}`);
    }
  };
  for (let i = 0; i < ids.length; i += 10) {
    await Promise.all(ids.slice(i, i + 10).map(async (sid) => out.set(sid, await leer(sid))));
  }
  return out;
}

/**
 * Lo que vendió Sendero fuera de ML en el mes: los pedidos del ERP de otros
 * canales (la web, los de a mano), sin los cancelados ni los que esperan el pago.
 */
async function ventasFueraDeMl(tenantId: string, desde: string, hasta: string): Promise<number> {
  const items = await prisma.itemPedido.findMany({
    where: {
      pedido: {
        tenantId,
        canalVenta: { not: "mercadolibre" },
        estado: { notIn: ["CANCELADO", "PENDIENTE_PAGO"] },
        fechaPedido: { gte: new Date(desde), lt: new Date(hasta) },
      },
    },
    select: { cantidad: true, precioUnitario: true },
  });
  return items.reduce((a, i) => a + i.cantidad * i.precioUnitario, 0);
}

interface FilaCierre {
  socio: string;
  anio: number;
  mes: number;
  unidades: number;
  bruto: number;
  comision: number;
  neto: number;
  envio: number;
  unidadesPropias: number;
  brutoPropio: number;
  netoPropio: number;
  brutoOtros: number;
  publicidad: number;
  notas: string | null;
  calculadoEn: Date;
}

/**
 * Arma el cierre con el reparto ya hecho.
 *
 * La proporción es el bruto del socio sobre el bruto de todo lo vendido en el
 * mes: lo suyo, lo de Sendero en ML y lo de Sendero fuera de ML. Es la base
 * sobre la que se calculan los impuestos que se reparten. Si en el mes no
 * vendió nadie, no hay proporción posible y no se reparte nada: mejor cero que
 * un número inventado.
 */
function armarCierre(
  fila: FilaCierre,
  pedidos: PedidoTercero[],
  compartidos: GastosCompartidos
): CierreTercero {
  const brutoTotal = fila.bruto + fila.brutoPropio + fila.brutoOtros;
  const proporcion = brutoTotal > 0 ? fila.bruto / brutoTotal : 0;
  const parteCompartidos = parteDeGastos(compartidos, proporcion);

  return {
    socio: fila.socio,
    anio: fila.anio,
    mes: fila.mes,
    unidades: fila.unidades,
    bruto: fila.bruto,
    comision: fila.comision,
    neto: fila.neto,
    envio: fila.envio,
    unidadesPropias: fila.unidadesPropias,
    brutoPropio: fila.brutoPropio,
    netoPropio: fila.netoPropio,
    brutoOtros: fila.brutoOtros,
    proporcion,
    publicidad: fila.publicidad,
    compartidos,
    parteCompartidos,
    aPasar: fila.neto - fila.envio - fila.publicidad - parteCompartidos,
    notas: fila.notas,
    pedidos,
    calculadoEn: fila.calculadoEn.toISOString(),
  };
}

/**
 * Lo que le toca al socio de los gastos del mes: percepciones y monotributo por
 * su proporción; el convenio, el monto fijo si está cargado, y si no (los meses
 * de antes del 2026-11-12) el total por su proporción.
 */
export function parteDeGastos(g: GastosCompartidos, proporcion: number): number {
  const convenio = g.iibbSocio ?? g.iibb * proporcion;
  return (g.percepciones + g.monotributo) * proporcion + convenio;
}

const SIN_GASTOS: GastosCompartidos = {
  percepciones: 0,
  iibb: 0,
  iibbSocio: null,
  monotributo: 0,
  notas: null,
};

/** Los gastos compartidos del mes. Ceros si todavía no se cargaron. */
export async function leerCompartidos(
  tenantId: string,
  anio: number,
  mes: number
): Promise<GastosCompartidos> {
  const g = await prisma.gastoCompartido.findUnique({
    where: { tenantId_anio_mes: { tenantId, anio, mes } },
  });
  if (!g) return { ...SIN_GASTOS };
  return {
    percepciones: g.percepciones,
    iibb: g.iibb,
    iibbSocio: g.iibbSocio,
    monotributo: g.monotributo,
    notas: g.notas,
  };
}

/** Guarda el total del mes de un gasto compartido. El reparto se recalcula solo. */
export async function guardarCompartidos(
  tenantId: string,
  anio: number,
  mes: number,
  campos: Partial<GastosCompartidos>
): Promise<GastosCompartidos> {
  const data: Partial<GastosCompartidos> = {};
  for (const k of CAMPOS_COMPARTIDOS) {
    if (typeof campos[k] === "number" && Number.isFinite(campos[k])) data[k] = campos[k];
  }
  if ("notas" in campos) data.notas = campos.notas ?? null;
  // El convenio fijo admite null: vuelve a repartir el total de ese mes.
  if (campos.iibbSocio === null || (typeof campos.iibbSocio === "number" && Number.isFinite(campos.iibbSocio))) {
    data.iibbSocio = campos.iibbSocio;
  }

  const g = await prisma.gastoCompartido.upsert({
    where: { tenantId_anio_mes: { tenantId, anio, mes } },
    create: { tenantId, anio, mes, ...data },
    update: data,
  });
  return {
    percepciones: g.percepciones,
    iibb: g.iibb,
    iibbSocio: g.iibbSocio,
    monotributo: g.monotributo,
    notas: g.notas,
  };
}

/** Guarda la publicidad del socio (imputación directa, no se prorratea). */
export async function guardarPublicidad(
  tenantId: string,
  anio: number,
  mes: number,
  publicidad: number,
  socio = SOCIO_SHAY
): Promise<CierreTercero | null> {
  const fila = await prisma.ventaTercero.update({
    where: { tenantId_socio_anio_mes: { tenantId, socio, anio, mes } },
    data: { publicidad },
  });
  return armarCierre(
    fila,
    (fila.pedidos ?? []) as unknown as PedidoTercero[],
    await leerCompartidos(tenantId, anio, mes)
  );
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
  return armarCierre(
    fila,
    (fila.pedidos ?? []) as unknown as PedidoTercero[],
    await leerCompartidos(tenantId, anio, mes)
  );
}

/**
 * Los gastos compartidos del último mes que tenga algo cargado. Sirven de
 * propuesta: el monotributo y el convenio se repiten mes a mes casi iguales.
 */
export async function compartidosPrevios(
  tenantId: string,
  anio: number,
  mes: number
): Promise<(GastosCompartidos & { anio: number; mes: number }) | null> {
  const previos = await prisma.gastoCompartido.findMany({
    where: { tenantId, OR: [{ anio: { lt: anio } }, { anio, mes: { lt: mes } }] },
    orderBy: [{ anio: "desc" }, { mes: "desc" }],
    take: 6,
  });
  const conDatos = previos.find((p) => p.percepciones || p.iibb || p.iibbSocio || p.monotributo);
  if (!conDatos) return null;
  return {
    anio: conDatos.anio,
    mes: conDatos.mes,
    percepciones: conDatos.percepciones,
    iibb: conDatos.iibb,
    iibbSocio: conDatos.iibbSocio,
    monotributo: conDatos.monotributo,
    notas: conDatos.notas,
  };
}
