import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { mlFetch } from "@/lib/mercadolibre";
import * as ads from "@/lib/publicidad-ml-api";
import { revisarNetos, sincronizarFlex, type ResultadoNetos } from "@/lib/neto-ml";

/**
 * Lo que factura Mercado Libre, línea por línea (docs/sdd/007).
 *
 * Sólo lectura de ML. Se guarda lo que no está dentro del neto de cada venta: publicidad,
 * percepciones y otros cargos (Mi página, devoluciones). La comisión y el envío ya vienen
 * descontados en el precio de cada línea de pedido, así que traerlos los contaría dos veces.
 *
 * Lo medido en la cuenta el 2026-11-04:
 * - El período va del 9 al 8: la clave "2026-10-01" es del 9/9 al 8/10.
 * - Cada cargo PADS es el gasto de una campaña el día anterior × 1,21. Por eso se puede saber de
 *   qué campaña es cada uno, aunque ML no lo diga: cuando coincide al centavo.
 * - Cada BPAD dice qué cargo anula (`charge_bonified_id`).
 * - Las percepciones aparecen recién al cerrar el período. La API no da las "aproximadas" que
 *   muestra la pantalla de ML.
 */

/** ML deja 5 pedidos por minuto a la API de facturación. */
const PAUSA_MS = 13_000;
const ESPERA_TRAS_LIMITE_MS = 20_000;
const POR_PAGINA = 100;
/** Las métricas de publicidad llegan a 90 días atrás. */
const DIAS_DE_METRICAS = 88;
/** Un período abierto se relee cada tanto: cambia todos los días, no cada minuto. */
const RELEER_ABIERTO_MS = 2 * 3600_000;

const DE_VENTA = /^[CB](VF[A-Z]|XD)$/;
const DE_PUBLICIDAD = new Set(["PADS", "BPAD", "CDLIT", "BDLIT"]);
const SOCIO_SHAY_CAMPANAS = "campanasShay";

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Un pedido a la API de facturación, respetando su límite. Si ML contesta que se pasó, espera y
 * vuelve a probar mientras quede tiempo; `null` = se acabó el tiempo, sigue en la pasada siguiente.
 */
let ultimoPedido = 0;
async function pedirFacturacion<T>(tenantId: string, path: string, hayTiempo: () => boolean): Promise<T | null> {
  while (hayTiempo()) {
    await pausa(Math.max(0, ultimoPedido + PAUSA_MS - Date.now()));
    ultimoPedido = Date.now();
    try {
      return await mlFetch<T>(tenantId, path);
    } catch (e) {
      if (!/\b429\b/.test(String(e))) throw e;
      await pausa(ESPERA_TRAS_LIMITE_MS);
    }
  }
  return null;
}

/** El cargo de Product Ads de un día es el gasto del día anterior. */
export function diaAnterior(dia: string): string {
  return new Date(new Date(`${dia}T12:00:00Z`).getTime() - 864e5).toISOString().slice(0, 10);
}

interface ConceptoResumen {
  label: string;
  amount: number;
  type: string;
  group_description?: string;
}

interface ResumenPeriodo {
  period?: { date_from?: string; date_to?: string; key?: string };
  bill_includes?: { total_amount?: number; total_perception?: number; bonuses?: ConceptoResumen[]; charges?: ConceptoResumen[] };
}

interface LineaMl {
  charge_info?: {
    creation_date_time?: string;
    detail_id?: number | string;
    transaction_detail?: string;
    charge_bonified_id?: number | string | null;
    detail_amount?: number;
    detail_type?: string;
    detail_sub_type?: string;
  };
}

function claseDe(c: ConceptoResumen): "publicidad" | "percepcion" | "otro" {
  if (DE_PUBLICIDAD.has(c.type)) return "publicidad";
  if ((c.group_description ?? "").trim() === "Impuestos") return "percepcion";
  return "otro";
}

export interface ResultadoSincronizacion {
  periodosLeidos: string[];
  /** Quedaron períodos sin leer porque se acabó el tiempo: volver a llamar los termina. */
  quedan: boolean;
  lineasNuevas: number;
  campanasIdentificadas: number;
  netos?: ResultadoNetos;
  flexNuevas?: number;
}

/**
 * Lee de ML lo que falte. Corta al terminarse `presupuestoMs` y sigue en la pasada siguiente.
 * `backfill` también vuelve a buscar la campaña de los cargos viejos, hasta donde llegan las
 * métricas; si no, sólo los de los últimos días.
 */
export async function sincronizarFacturacion(
  tenantId: string,
  opts: { presupuestoMs?: number; backfill?: boolean } = {}
): Promise<ResultadoSincronizacion> {
  const fin = Date.now() + (opts.presupuestoMs ?? 45_000);
  const hayTiempo = () => Date.now() + PAUSA_MS < fin;
  const out: ResultadoSincronizacion = { periodosLeidos: [], quedan: false, lineasNuevas: 0, campanasIdentificadas: 0 };

  const lista = await pedirFacturacion<{ results?: Array<{ key: string; period_status?: string }> }>(
    tenantId,
    `/billing/integration/monthly/periods?group=ML&document_type=BILL&offset=0&limit=12`,
    hayTiempo
  );
  if (!lista) return { ...out, quedan: true };
  const periodos = (lista.results ?? []).filter((p) => p.key).sort((a, b) => a.key.localeCompare(b.key));
  const ya = await prisma.periodoMl.findMany({ where: { tenantId }, select: { clave: true, grupo: true, completo: true, leidoEn: true } });
  const de = new Map(ya.map((p) => [`${p.clave}|${p.grupo}`, p]));

  for (const p of periodos) {
    for (const grupo of ["ML", "MP"] as const) {
      const leido = de.get(`${p.key}|${grupo}`);
      if (leido?.completo) continue;
      if (leido && Date.now() - leido.leidoEn.getTime() < RELEER_ABIERTO_MS) continue;
      if (!hayTiempo()) {
        out.quedan = true;
        break;
      }
      const r = await leerPeriodo(tenantId, p.key, grupo, p.period_status ?? "OPEN", hayTiempo);
      out.lineasNuevas += r.nuevas;
      if (!r.terminado) out.quedan = true;
      if (!out.periodosLeidos.includes(p.key)) out.periodosLeidos.push(p.key);
    }
    if (out.quedan) break;
  }

  // Lo que sigue no usa la API de facturación: no tiene ese límite.
  out.campanasIdentificadas = await identificarCampanas(tenantId, opts.backfill ? DIAS_DE_METRICAS : 5);
  await aplicarAShay(tenantId);
  // Lo de Mercado Pago, con el tiempo que quede: tampoco tiene ese límite.
  const flex = await sincronizarFlex(tenantId, { hasta: fin }).catch(() => ({ nuevas: 0, quedan: true }));
  out.flexNuevas = flex.nuevas;
  out.netos = await revisarNetos(tenantId, { hasta: fin }).catch(() => undefined);
  if (flex.quedan || out.netos?.quedan) out.quedan = true;
  return out;
}

async function leerPeriodo(
  tenantId: string,
  clave: string,
  grupo: "ML" | "MP",
  estado: string,
  hayTiempo: () => boolean
): Promise<{ nuevas: number; terminado: boolean }> {
  const resumen = await pedirFacturacion<ResumenPeriodo>(tenantId, `/billing/integration/periods/key/${clave}/summary/details?group=${grupo}&document_type=BILL`, hayTiempo);
  if (!resumen) return { nuevas: 0, terminado: false };
  const conceptos = [...(resumen.bill_includes?.charges ?? []), ...(resumen.bill_includes?.bonuses ?? [])].filter((c) => !DE_VENTA.test(c.type));
  const clases = new Map(conceptos.map((c) => [c.type, claseDe(c)]));
  const base = { estado, total: resumen.bill_includes?.total_amount ?? 0, resumen: resumen as unknown as Prisma.InputJsonValue, leidoEn: new Date() };
  const guardar = (extra: { lineasTotal?: number; completo?: boolean }) =>
    prisma.periodoMl.upsert({
      where: { tenantId_clave_grupo: { tenantId, clave, grupo } },
      create: { tenantId, clave, grupo, ...base, ...extra },
      update: { ...base, ...extra },
    });

  if (conceptos.length === 0) {
    await guardar({ lineasTotal: 0, completo: estado === "CLOSED" });
    return { nuevas: 0, terminado: true };
  }

  const tipos = [...clases.keys()].join(",");
  let offset = await prisma.cargoMl.count({ where: { tenantId, periodo: clave, grupo } });
  let total = Infinity;
  let nuevas = 0;
  let rearmo = false;

  while (true) {
    const r = await pedirFacturacion<{ total?: number; paging?: { total?: number }; results?: LineaMl[] }>(
      tenantId,
      `/billing/integration/periods/key/${clave}/group/${grupo}/details?document_type=BILL&detail_sub_types=${tipos}&limit=${POR_PAGINA}&offset=${offset}&sort_by=ID&order_by=ASC`,
      hayTiempo
    );
    if (!r) {
      await guardar({ completo: false });
      return { nuevas, terminado: false };
    }
    total = r.total ?? r.paging?.total ?? 0;
    const filas: Prisma.CargoMlCreateManyInput[] = [];
    for (const l of r.results ?? []) {
      const c = l.charge_info;
      if (!c?.detail_id || !c.creation_date_time || !c.detail_sub_type) continue;
      const dia = c.creation_date_time.slice(0, 10);
      filas.push({
        detalleId: String(c.detail_id),
        tenantId,
        periodo: clave,
        grupo,
        tipo: c.detail_sub_type,
        clase: clases.get(c.detail_sub_type) ?? "otro",
        concepto: c.transaction_detail ?? c.detail_sub_type,
        bonificacion: c.detail_type !== "CHARGE",
        monto: Math.abs(Number(c.detail_amount) || 0),
        fecha: new Date(`${c.creation_date_time}-03:00`),
        // Product Ads se cobra a la mañana siguiente, comprobado al centavo contra cada campaña.
        diaGasto: c.detail_sub_type === "PADS" || c.detail_sub_type === "BPAD" ? diaAnterior(dia) : dia,
        bonificaId: c.charge_bonified_id != null ? String(c.charge_bonified_id) : null,
      });
    }
    if (filas.length) nuevas += (await prisma.cargoMl.createMany({ data: filas, skipDuplicates: true })).count;
    offset += r.results?.length ?? 0;
    if (!r.results?.length || offset >= total) {
      const hay = await prisma.cargoMl.count({ where: { tenantId, periodo: clave, grupo } });
      // Un tipo nuevo puede correr las posiciones: una sola vez, se lee de nuevo desde el principio.
      if (hay < total && !rearmo) {
        rearmo = true;
        offset = 0;
        continue;
      }
      await guardar({ lineasTotal: total, completo: estado === "CLOSED" && hay >= total && (await cierraConElResumen(tenantId, clave, grupo, conceptos)) });
      return { nuevas, terminado: true };
    }
  }
}

/**
 * Las líneas guardadas tienen que sumar lo que dice el resumen de ML, tipo por tipo. Si no, el
 * período no queda completo y se vuelve a leer: en marzo de 2026 el detalle vino vacío con un
 * resumen de $300.631, y darlo por bueno habría dejado ese mes sin cargos, sin ningún aviso.
 */
async function cierraConElResumen(tenantId: string, clave: string, grupo: string, conceptos: ConceptoResumen[]): Promise<boolean> {
  const filas = await prisma.cargoMl.groupBy({ by: ["tipo"], where: { tenantId, periodo: clave, grupo }, _sum: { monto: true } });
  const suma = new Map(filas.map((f) => [f.tipo, f._sum.monto ?? 0]));
  return conceptos.every((c) => Math.abs((suma.get(c.type) ?? 0) - Math.abs(c.amount)) <= 1);
}

/**
 * Le pone campaña a cada cargo de Product Ads. ML no la dice, pero cada cargo es el gasto de una
 * campaña ese día × 1,21: si coincide al centavo, es esa; si no coincide ninguna, queda sin
 * campaña antes que adivinar. Cada anulación hereda la campaña del cargo que anula.
 */
export async function identificarCampanas(tenantId: string, diasAtras: number): Promise<number> {
  const desde = new Date(Date.now() - diasAtras * 864e5).toISOString().slice(0, 10);
  const sinCampana = await prisma.cargoMl.findMany({
    where: { tenantId, tipo: "PADS", campanaId: null, diaGasto: { gte: desde } },
    select: { detalleId: true, diaGasto: true, monto: true },
  });
  if (sinCampana.length === 0) return 0;
  const anunciante = await ads.anunciante(tenantId);
  if (!anunciante) return 0;

  const porDia = new Map<string, typeof sinCampana>();
  for (const l of sinCampana) porDia.set(l.diaGasto, [...(porDia.get(l.diaGasto) ?? []), l]);

  let hechas = 0;
  for (const [dia, lineas] of porDia) {
    const campanas = (await ads.campanas(tenantId, anunciante, { desde: dia, hasta: dia })).filter((c) => c.metrics.cost > 0);
    const libres = new Set(campanas.map((c) => c.id));
    for (const l of lineas) {
      const c = campanas.find((x) => libres.has(x.id) && Math.abs(x.metrics.cost * 1.21 - l.monto) <= 0.02);
      if (!c) continue;
      libres.delete(c.id);
      await prisma.cargoMl.update({ where: { detalleId: l.detalleId }, data: { campanaId: BigInt(c.id), campana: c.name } });
      hechas++;
    }
  }
  await prisma.$executeRaw`
    UPDATE public.cargos_ml AS b
       SET campana_id = c.campana_id, campana = c.campana
      FROM public.cargos_ml AS c
     WHERE b.tenant_id = ${tenantId} AND b.bonifica_id = c.detalle_id
       AND b.campana_id IS NULL AND c.campana_id IS NOT NULL
  `;
  return hechas;
}

/** Las campañas de Shay, tildadas en /shay. */
export async function campanasDeShay(tenantId: string): Promise<number[]> {
  const cfg = await prisma.configTenant.findUnique({ where: { tenantId } });
  const ids = ((cfg?.data ?? {}) as Record<string, unknown>)[SOCIO_SHAY_CAMPANAS];
  return Array.isArray(ids) ? ids.map(Number).filter(Number.isFinite) : [];
}

/**
 * Lo facturado por unas campañas en un mes, con IVA y sin lo anulado. `null` si los cargos de ese
 * mes no se pudieron atribuir desde el primer día: las métricas sólo llegan a 90 días, y un
 * número a medias parecería bueno.
 */
export async function publicidadDeCampanas(tenantId: string, anio: number, mes: number, ids: number[]): Promise<number | null> {
  const mm = `${anio}-${String(mes).padStart(2, "0")}`;
  const primera = await prisma.cargoMl.findFirst({
    where: { tenantId, tipo: "PADS", campanaId: { not: null } },
    orderBy: { diaGasto: "asc" },
    select: { diaGasto: true },
  });
  if (!primera || primera.diaGasto > `${mm}-01`) return null;
  const filas = await prisma.cargoMl.findMany({
    where: { tenantId, clase: "publicidad", campanaId: { in: ids.map((i) => BigInt(i)) }, diaGasto: { gte: `${mm}-01`, lte: `${mm}-31` } },
    select: { monto: true, bonificacion: true },
  });
  return filas.reduce((s, f) => s + (f.bonificacion ? -f.monto : f.monto), 0);
}

/** El período de ML que corresponde a un mes: octubre es el que cierra el 8 de noviembre. */
export function periodoDelMes(anio: number, mes: number): string {
  const sig = mes === 12 ? { a: anio + 1, m: 1 } : { a: anio, m: mes + 1 };
  return `${sig.a}-${String(sig.m).padStart(2, "0")}-01`;
}

/**
 * Lleva lo facturado al cierre de Shay: su publicidad real, y las percepciones reales de los
 * períodos ya cerrados en lugar de lo cargado a mano. Sólo toca los meses que ya tienen cierre.
 */
export async function aplicarAShay(tenantId: string): Promise<void> {
  const ids = await campanasDeShay(tenantId);
  const cierres = await prisma.ventaTercero.findMany({ where: { tenantId }, select: { id: true, anio: true, mes: true } });
  for (const c of cierres) {
    if (ids.length) {
      const pub = await publicidadDeCampanas(tenantId, c.anio, c.mes, ids);
      if (pub != null) await prisma.ventaTercero.update({ where: { id: c.id }, data: { publicidad: Math.round(pub * 100) / 100 } });
    }
    const clave = periodoDelMes(c.anio, c.mes);
    const periodo = await prisma.periodoMl.findUnique({ where: { tenantId_clave_grupo: { tenantId, clave, grupo: "ML" } }, select: { completo: true } });
    if (!periodo?.completo) continue;
    const percepciones = await prisma.cargoMl.findMany({ where: { tenantId, periodo: clave, clase: "percepcion" }, select: { monto: true, bonificacion: true } });
    const total = percepciones.reduce((s, f) => s + (f.bonificacion ? -f.monto : f.monto), 0);
    await prisma.gastoCompartido.upsert({
      where: { tenantId_anio_mes: { tenantId, anio: c.anio, mes: c.mes } },
      create: { tenantId, anio: c.anio, mes: c.mes, percepciones: total },
      update: { percepciones: total },
    });
  }
}
