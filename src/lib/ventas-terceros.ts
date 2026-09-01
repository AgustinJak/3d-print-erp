import { prisma } from "@/lib/prisma";
import { getMlAccount, searchOrders, type MlOrder } from "@/lib/mercadolibre";
import type { Prisma } from "@/generated/prisma";

/**
 * Reparto de la cuenta de Mercado Libre compartida con Shay Juguetes.
 *
 * Las publicaciones marcadas `ignorar` son de Shay: el ERP no les crea pedido,
 * pero la plata entra a la misma cuenta y hay que pasársela. Esto reconstruye
 * el mes desde la API de ML — los dos lados en la misma pasada — y guarda el
 * cierre.
 *
 * Cómo se reparte cada cosa:
 *
 *   comisión de ML   directo, por venta: ML ya la cobra sobre cada item
 *   publicidad       directo, por campaña: se sabe de quién es cada una
 *   percepciones     prorrateado por neto
 *   convenio         prorrateado por neto
 *   monotributo      prorrateado por neto
 *
 * Lo prorrateado se carga una sola vez con el total del mes
 * (`GastoCompartido`) y cada tienda se hace cargo de lo que le toca según
 * cuánto vendió. Nadie carga dos veces el mismo número.
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

/** Los gastos del mes que no son de una tienda sola. Total, sin repartir. */
export interface GastosCompartidos {
  percepciones: number;
  iibb: number;         // convenio multilateral
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

  // el otro lado de la cuenta, para poder repartir
  unidadesPropias: number;
  brutoPropio: number;
  netoPropio: number;

  proporcion: number;   // neto del socio sobre el neto total (0 a 1)

  publicidad: number;   // sus campañas, imputación directa
  compartidos: GastosCompartidos;   // totales del mes, sin repartir
  parteCompartidos: number;         // lo que le toca de esos totales
  aPasar: number;       // neto − publicidad − parteCompartidos

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
      ...propio,
      pedidos: pedidos as unknown as Prisma.InputJsonValue,
    },
    update: { ...totales, ...propio, pedidos: pedidos as unknown as Prisma.InputJsonValue },
  });

  return armarCierre(fila, pedidos, await leerCompartidos(tenantId, anio, mes));
}

interface FilaCierre {
  socio: string;
  anio: number;
  mes: number;
  unidades: number;
  bruto: number;
  comision: number;
  neto: number;
  unidadesPropias: number;
  brutoPropio: number;
  netoPropio: number;
  publicidad: number;
  notas: string | null;
  calculadoEn: Date;
}

/**
 * Arma el cierre con el reparto ya hecho.
 *
 * La proporción se calcula sobre el neto (después de la comisión de ML), que es
 * la plata que realmente entró por cada lado. Si en el mes no vendió nadie, no
 * hay proporción posible y no se reparte nada: mejor cero que un número
 * inventado.
 */
function armarCierre(
  fila: FilaCierre,
  pedidos: PedidoTercero[],
  compartidos: GastosCompartidos
): CierreTercero {
  const netoTotal = fila.neto + fila.netoPropio;
  const proporcion = netoTotal > 0 ? fila.neto / netoTotal : 0;
  const totalCompartido = compartidos.percepciones + compartidos.iibb + compartidos.monotributo;
  const parteCompartidos = totalCompartido * proporcion;

  return {
    socio: fila.socio,
    anio: fila.anio,
    mes: fila.mes,
    unidades: fila.unidades,
    bruto: fila.bruto,
    comision: fila.comision,
    neto: fila.neto,
    unidadesPropias: fila.unidadesPropias,
    brutoPropio: fila.brutoPropio,
    netoPropio: fila.netoPropio,
    proporcion,
    publicidad: fila.publicidad,
    compartidos,
    parteCompartidos,
    aPasar: fila.neto - fila.publicidad - parteCompartidos,
    notas: fila.notas,
    pedidos,
    calculadoEn: fila.calculadoEn.toISOString(),
  };
}

const SIN_GASTOS: GastosCompartidos = {
  percepciones: 0,
  iibb: 0,
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

  const g = await prisma.gastoCompartido.upsert({
    where: { tenantId_anio_mes: { tenantId, anio, mes } },
    create: { tenantId, anio, mes, ...data },
    update: data,
  });
  return {
    percepciones: g.percepciones,
    iibb: g.iibb,
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
  const conDatos = previos.find((p) => p.percepciones || p.iibb || p.monotributo);
  if (!conDatos) return null;
  return {
    anio: conDatos.anio,
    mes: conDatos.mes,
    percepciones: conDatos.percepciones,
    iibb: conDatos.iibb,
    monotributo: conDatos.monotributo,
    notas: conDatos.notas,
  };
}
