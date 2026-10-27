import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma";
import { cargarContextoDePrecios, leerGastosDeVenta, preciosDeCombinaciones } from "@/lib/precios-combinacion";
import * as ml from "@/lib/publicidad-ml-api";
import {
  alertasDe,
  gananciaAntesDePublicidad,
  revisarCambioAnuncio,
  revisarCambioCampana,
  roasMinimo,
  roasQueAsumeElPrecio,
  type Alerta,
  type CampoCambiado,
  type PedidoAnuncio,
  type PedidoCampana,
  type Revision,
} from "@/lib/publicidad-reglas";

/**
 * Publicidad de Mercado Libre (docs/sdd/005): qué deja cada campaña y cada anuncio, y los cambios
 * con su registro. Lo usan la página Publicidad y el MCP de Claude (`scripts/mcp-publicidad.ts`):
 * el mismo cálculo y las mismas reglas por los dos lados.
 */

/* ───────────────────────── Resumen (spec 001) ───────────────────────── */

export interface CostoDeAnuncio {
  /** Promedio de las publicaciones del anuncio que tienen costo. */
  precio: number;
  costo: number;
  /** Lo que deja una venta antes de pagar publicidad. */
  ganancia: number;
  roasMinimo: number | null;
  fuente: "bodega" | "ventas";
}

export interface FilaAnuncio {
  id: number;
  campanaId: number;
  titulo: string;
  foto: string | null;
  estado: string;
  tipo: string;
  publicaciones: Array<{ mla: string; enlace: string | null; precio: number }>;
  gasto: number;
  ventas: number;
  unidades: number;
  clics: number;
  impresiones: number;
  roas: number | null;
  costo: CostoDeAnuncio | null;
  /** Ventas atribuidas × (ganancia / precio) − gasto (RN-3). `null` sin costo. */
  gananciaEstimada: number | null;
  alertas: Alerta[];
}

export interface FilaCampana {
  id: number;
  nombre: string;
  estado: string;
  estrategia: string;
  roasObjetivo: number | null;
  presupuesto: number;
  esShay: boolean;
  gasto: number;
  ventas: number;
  unidades: number;
  clics: number;
  impresiones: number;
  roas: number | null;
  roasMinimo: number | null;
  gananciaEstimada: number | null;
  /** Qué parte del gasto tiene costo conocido y entra en la ganancia. */
  cobertura: number | null;
  perdidoPorPresupuesto: number | null;
  perdidoPorRanking: number | null;
  ultimoCambio: string | null;
  alertas: Alerta[];
  anuncios: FilaAnuncio[];
}

export interface Totales {
  gasto: number;
  ventas: number;
  roas: number | null;
  gananciaEstimada: number | null;
  cobertura: number | null;
}

export type ResumenPublicidad =
  | {
      disponible: true;
      rango: ml.Rango;
      /** Sólo las campañas de Sendero. */
      totales: Totales;
      shay: { gasto: number; ventas: number };
      campanas: FilaCampana[];
      /** Publicaciones con anuncio posible que no están en ninguna campaña (ML les pone campaña 0). */
      sinCampana: FilaAnuncio[];
      dias: ml.DiaMl[];
      roasQueAsumeElPrecio: number | null;
      leidoEn: string;
    }
  | { disponible: false; motivo: string };

const SIN_PERMISO =
  "La cuenta de Mercado Libre no tiene el permiso de publicidad. Hay que darlo en la app de ML y reconectar la cuenta en Integraciones.";
const ML_CAIDO = "Mercado Libre no está respondiendo el servicio de publicidad. Es de su lado; probá de nuevo en un rato.";

function esCaida(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : "";
  return /ML API 5\d\d/.test(msg) || /no healthy upstream|fetch failed/i.test(msg);
}

/** Cuáles son de Shay: la selección de Finanzas › Shay (`config_tenant.data.campanasShay`). */
async function campanasDeShay(tenantId: string): Promise<Set<number>> {
  const cfg = await prisma.configTenant.findUnique({ where: { tenantId } });
  const ids = ((cfg?.data ?? {}) as Record<string, unknown>).campanasShay;
  return new Set(Array.isArray(ids) ? ids.map(Number).filter(Number.isFinite) : []);
}

async function ultimosCambios(tenantId: string, tipo: "campana" | "anuncio"): Promise<Map<string, Date>> {
  const filas = await prisma.cambioPublicidad.groupBy({
    by: ["objetivoId"],
    where: { tenantId, tipo, estado: "aplicado" },
    _max: { creadoEn: true },
  });
  return new Map(filas.filter((f) => f._max.creadoEn).map((f) => [f.objetivoId, f._max.creadoEn!]));
}

/** Las publicaciones de ML cambian poco: se recuerdan unas horas para no pedirlas en cada vista. */
const RECUERDO_MS = 6 * 60 * 60 * 1000;
const recuerdo = new Map<string, { en: number; pub: ml.PublicacionDeMl | null }>();

async function publicacionesConRecuerdo(tenantId: string, mlas: string[]): Promise<Map<string, ml.PublicacionDeMl>> {
  const ahora = Date.now();
  const faltan = mlas.filter((m) => {
    const r = recuerdo.get(m);
    return !r || ahora - r.en > RECUERDO_MS;
  });
  if (faltan.length) {
    const leidas = new Map((await ml.publicaciones(tenantId, faltan)).map((p) => [p.id, p]));
    for (const m of faltan) recuerdo.set(m, { en: ahora, pub: leidas.get(m) ?? null });
  }
  const out = new Map<string, ml.PublicacionDeMl>();
  for (const m of mlas) {
    const p = recuerdo.get(m)?.pub;
    if (p) out.set(m, p);
  }
  return out;
}

/**
 * El costo de una venta de cada publicación que conoce el ERP (RN-4): por Bodega, con la clave de
 * ML y la combinación; si no hay, el costo guardado en sus ventas de los últimos 90 días.
 */
async function costosPorPublicacion(tenantId: string): Promise<Map<string, { costo: number; fuente: "bodega" | "ventas" }>> {
  const [claves, precios, ventas] = await Promise.all([
    prisma.mapeoCanal.findMany({
      where: { tenantId, canal: "mercadolibre", ignorar: false, combinacionId: { not: null } },
      select: { clave: true, combinacionId: true, unidades: true },
    }),
    cargarContextoDePrecios(tenantId).then((cx) => preciosDeCombinaciones(tenantId, {}, cx)),
    prisma.itemPedido.groupBy({
      by: ["mlaOrigen"],
      where: {
        mlaOrigen: { not: null },
        costoUnitario: { gt: 0 },
        pedido: { tenantId, fechaPedido: { gte: new Date(Date.now() - 90 * 86_400_000) } },
      },
      _avg: { costoUnitario: true },
    }),
  ]);
  const costoDe = new Map(
    precios.filter((p) => p.costo).map((p) => [p.combinacionId, p.costo!.fabricacion + p.costo!.insumos])
  );

  const porMla = new Map<string, number[]>();
  for (const k of claves) {
    const c = costoDe.get(k.combinacionId!);
    if (c == null) continue;
    const mla = k.clave.split("|")[0];
    porMla.set(mla, [...(porMla.get(mla) ?? []), c * Math.max(1, k.unidades)]);
  }
  const out = new Map<string, { costo: number; fuente: "bodega" | "ventas" }>();
  for (const [mla, cs] of porMla) out.set(mla, { costo: cs.reduce((a, b) => a + b, 0) / cs.length, fuente: "bodega" });
  for (const v of ventas) {
    if (v.mlaOrigen && !out.has(v.mlaOrigen) && v._avg.costoUnitario) {
      out.set(v.mlaOrigen, { costo: v._avg.costoUnitario, fuente: "ventas" });
    }
  }
  return out;
}

/** Las publicaciones que conoce el ERP: las de las claves de ML y las de `publicaciones_ml`. */
async function mlasDelErp(tenantId: string): Promise<string[]> {
  const [claves, pubs] = await Promise.all([
    prisma.mapeoCanal.findMany({ where: { tenantId, canal: "mercadolibre" }, select: { clave: true } }),
    prisma.publicacionMl.findMany({ where: { tenantId, ignorar: false }, select: { mla: true } }),
  ]);
  return [...new Set([...claves.map((c) => c.clave.split("|")[0]), ...pubs.map((p) => p.mla)])].filter((m) => /^MLA\d+$/.test(m));
}

const roasDe = (ventas: number, gasto: number) => (gasto > 0 ? ventas / gasto : null);

/**
 * El ROAS mínimo de un grupo de anuncios: la media armónica de los suyos, pesada por lo que
 * vendió cada uno (por lo gastado si nadie vendió). Es el ROAS con el que el grupo entero queda
 * en cero.
 */
function roasMinimoDeGrupo(anuncios: FilaAnuncio[]): number | null {
  const con = anuncios.filter((a) => a.costo?.roasMinimo);
  const vendio = con.some((a) => a.ventas > 0);
  const peso = (a: FilaAnuncio) => (vendio ? a.ventas : a.gasto);
  const w = con.reduce((s, a) => s + peso(a), 0);
  const wr = con.reduce((s, a) => s + peso(a) / a.costo!.roasMinimo!, 0);
  return w > 0 && wr > 0 ? w / wr : null;
}

/**
 * La ganancia de un grupo de anuncios y qué parte de `gasto` explica.
 *
 * `gasto` es el de la campaña (o el total), no la suma de sus anuncios: un anuncio que cambió de
 * campaña en el período trae sus métricas enteras a la campaña donde está ahora, y la campaña de
 * antes queda con gasto y sin anuncios. Medir la cobertura contra el gasto de verdad es lo que
 * hace que eso se vea en vez de esconderse.
 */
function sumarGanancia(anuncios: FilaAnuncio[], gasto: number): { ganancia: number | null; cobertura: number | null } {
  const con = anuncios.filter((a) => a.gananciaEstimada != null);
  if (!con.length) return { ganancia: null, cobertura: gasto > 0 ? 0 : null };
  return {
    ganancia: con.reduce((s, a) => s + a.gananciaEstimada!, 0),
    cobertura: gasto > 0 ? Math.min(1, con.reduce((s, a) => s + a.gasto, 0) / gasto) : null,
  };
}

export async function resumenPublicidad(tenantId: string, rango: ml.Rango): Promise<ResumenPublicidad> {
  let a: ml.Anunciante | null;
  try {
    a = await ml.anunciante(tenantId);
  } catch (e) {
    return { disponible: false, motivo: esCaida(e) ? ML_CAIDO : SIN_PERMISO };
  }
  if (!a) return { disponible: false, motivo: SIN_PERMISO };
  const anun = a;

  // Lo de ML y lo de la base van en paralelo: por separado son unos segundos cada uno.
  const delErp = Promise.all([campanasDeShay(tenantId), ultimosCambios(tenantId, "campana"), costosPorPublicacion(tenantId), leerGastosDeVenta()]);
  const pubsP = mlasDelErp(tenantId)
    .then((mlas) => publicacionesConRecuerdo(tenantId, mlas))
    .catch(() => new Map<string, ml.PublicacionDeMl>());
  delErp.catch(() => null);

  let campanas: ml.CampanaMl[], anuncios: ml.AnuncioMl[], dias: ml.DiaMl[];
  try {
    [campanas, anuncios, dias] = await Promise.all([
      ml.campanas(tenantId, anun, rango),
      ml.anuncios(tenantId, anun, rango),
      ml.serieDiaria(tenantId, anun, rango).catch(() => [] as ml.DiaMl[]),
    ]);
  } catch (e) {
    return { disponible: false, motivo: esCaida(e) ? ML_CAIDO : e instanceof Error ? e.message : "error" };
  }

  // La cuota de impresiones sólo de las campañas que gastaron: es una llamada por campaña.
  const cuotas = new Map<number, ml.CuotaDeImpresiones>();
  const cuotasP = Promise.all(
    campanas
      .filter((c) => c.metrics.cost > 0)
      .map((c) =>
        ml
          .cuotaDeImpresiones(tenantId, anun, c.id, rango)
          .then((q) => cuotas.set(c.id, q))
          .catch(() => null)
      )
  );

  const [[shay, cambiosCampana, costos, { gastos }], pubs] = await Promise.all([delErp, pubsP, cuotasP]);

  // De anuncio a publicaciones: por id (ITEM), por familia (FAMILY) o por catálogo (CATALOG).
  const porFamilia = new Map<string, ml.PublicacionDeMl[]>();
  const porCatalogo = new Map<string, ml.PublicacionDeMl[]>();
  for (const p of pubs.values()) {
    if (p.family_id) porFamilia.set(p.family_id, [...(porFamilia.get(p.family_id) ?? []), p]);
    if (p.catalog_product_id) porCatalogo.set(p.catalog_product_id, [...(porCatalogo.get(p.catalog_product_id) ?? []), p]);
  }
  const publicacionesDe = (g: ml.AnuncioMl): ml.PublicacionDeMl[] => {
    if (g.ad_group_type === "FAMILY") return porFamilia.get(g.ad_group_external_id) ?? [];
    if (g.ad_group_type === "CATALOG") return porCatalogo.get(g.ad_group_external_id) ?? [];
    const p = pubs.get(g.ad_group_external_id);
    return p ? [p] : [];
  };

  const filasAnuncio = anuncios.map((g): FilaAnuncio => {
    const ps = publicacionesDe(g);
    const conCosto = ps.filter((p) => costos.has(p.id) && p.price > 0);
    let costo: CostoDeAnuncio | null = null;
    if (conCosto.length) {
      const precio = conCosto.reduce((s, p) => s + p.price, 0) / conCosto.length;
      const c = conCosto.reduce((s, p) => s + costos.get(p.id)!.costo, 0) / conCosto.length;
      // El margen es el promedio de los márgenes, no el de los promedios: con envío de por medio no da igual.
      const r = conCosto.reduce((s, p) => s + gananciaAntesDePublicidad(gastos, p.price, costos.get(p.id)!.costo) / p.price, 0) / conCosto.length;
      costo = {
        precio,
        costo: c,
        ganancia: r * precio,
        roasMinimo: roasMinimo(1, r),
        fuente: conCosto.every((p) => costos.get(p.id)!.fuente === "bodega") ? "bodega" : "ventas",
      };
    }
    const m = g.metrics;
    const ganancia = costo ? m.total_amount * (costo.ganancia / costo.precio) - m.cost : null;
    return {
      id: g.id,
      campanaId: g.campaign_id,
      titulo: g.title,
      foto: g.thumbnail?.replace(/^http:/, "https:") ?? null,
      estado: g.status,
      tipo: g.ad_group_type,
      publicaciones: ps.map((p) => ({ mla: p.id, enlace: p.permalink, precio: p.price })),
      gasto: m.cost,
      ventas: m.total_amount,
      unidades: m.units_quantity,
      clics: m.clicks,
      impresiones: m.prints,
      roas: roasDe(m.total_amount, m.cost),
      costo,
      gananciaEstimada: ganancia,
      alertas: alertasDe({
        gasto: m.cost,
        ventas: m.total_amount,
        roasMinimo: costo?.roasMinimo ?? null,
        noCierra: !!costo && costo.ganancia <= 0,
        activa: g.status === "ACTIVE",
      }),
    };
  });

  const filasCampana = campanas.map((c): FilaCampana => {
    const suyos = filasAnuncio.filter((x) => x.campanaId === c.id).sort((x, y) => y.gasto - x.gasto);
    const esShay = shay.has(c.id);
    const { ganancia, cobertura } = esShay ? { ganancia: null, cobertura: null } : sumarGanancia(suyos, c.metrics.cost);
    const minimo = esShay ? null : roasMinimoDeGrupo(suyos);
    const q = cuotas.get(c.id);
    return {
      id: c.id,
      nombre: c.name,
      estado: c.status,
      estrategia: c.strategy,
      roasObjetivo: c.roas_target,
      presupuesto: c.budget,
      esShay,
      gasto: c.metrics.cost,
      ventas: c.metrics.total_amount,
      unidades: c.metrics.units_quantity,
      clics: c.metrics.clicks,
      impresiones: c.metrics.prints,
      roas: roasDe(c.metrics.total_amount, c.metrics.cost),
      roasMinimo: minimo,
      gananciaEstimada: ganancia,
      cobertura,
      perdidoPorPresupuesto: q?.lost_impression_share_by_budget ?? null,
      perdidoPorRanking: q?.lost_impression_share_by_ad_rank ?? null,
      ultimoCambio: cambiosCampana.get(String(c.id))?.toISOString() ?? null,
      alertas: alertasDe({
        gasto: c.metrics.cost,
        ventas: c.metrics.total_amount,
        roasMinimo: minimo,
        activa: c.status === "active",
        perdidoPorPresupuesto: q?.lost_impression_share_by_budget ?? null,
      }),
      anuncios: suyos,
    };
  });
  // Primero las activas, después por gasto.
  filasCampana.sort((x, y) => Number(y.estado === "active") - Number(x.estado === "active") || y.gasto - x.gasto);

  const sendero = filasCampana.filter((c) => !c.esShay);
  const deShay = filasCampana.filter((c) => c.esShay);
  const gasto = sendero.reduce((s, c) => s + c.gasto, 0);
  const ventas = sendero.reduce((s, c) => s + c.ventas, 0);
  // Los sin campaña que gastaron en el período (los sacaron de una) también son de Sendero si el
  // ERP los conoce; los de Shay no tienen costo y no suman.
  const total = sumarGanancia([...sendero.flatMap((c) => c.anuncios), ...filasAnuncio.filter((x) => !x.campanaId && x.gasto > 0)], gasto);

  return {
    disponible: true,
    rango,
    totales: { gasto, ventas, roas: roasDe(ventas, gasto), gananciaEstimada: total.ganancia, cobertura: total.cobertura },
    shay: { gasto: deShay.reduce((s, c) => s + c.gasto, 0), ventas: deShay.reduce((s, c) => s + c.ventas, 0) },
    campanas: filasCampana,
    // Las de Shay no se distinguen acá: ML no las separa y no están en el ERP. Van al final.
    sinCampana: filasAnuncio
      .filter((x) => !x.campanaId)
      .sort((x, y) => Number(y.publicaciones.length > 0) - Number(x.publicaciones.length > 0) || x.titulo.localeCompare(y.titulo)),
    dias,
    roasQueAsumeElPrecio: roasQueAsumeElPrecio(gastos),
    leidoEn: new Date().toISOString(),
  };
}

/* ───────────────────────── Cambios (spec 002) ───────────────────────── */

export type PedidoDeCambio =
  | { tipo: "campana"; id: number; cambios: PedidoCampana }
  | { tipo: "anuncio"; id: number; cambios: PedidoAnuncio };

export interface VistaPrevia {
  tipo: "campana" | "anuncio";
  id: number;
  nombre: string;
  cambios: CampoCambiado[];
  errores: string[];
  avisos: Array<{ texto: string; aparte: boolean }>;
}

export type ResultadoCambio =
  | { estado: "aplicado"; vista: VistaPrevia; respuesta: unknown }
  | { estado: "rechazado"; vista: VistaPrevia; motivo: string }
  | { estado: "error"; vista: VistaPrevia; motivo: string };

interface Preparado {
  vista: VistaPrevia;
  revision: Revision<PedidoCampana> | Revision<PedidoAnuncio>;
  antes: Record<string, unknown>;
  anunciante: ml.Anunciante;
}

async function preparar(tenantId: string, pedido: PedidoDeCambio): Promise<Preparado> {
  const a = await ml.anunciante(tenantId);
  if (!a) throw new Error(SIN_PERMISO);
  const shay = await campanasDeShay(tenantId);

  if (pedido.tipo === "campana") {
    const [actual, ultimos] = await Promise.all([ml.campana(tenantId, a, pedido.id), ultimosCambios(tenantId, "campana")]);
    const revision = revisarCambioCampana(actual, pedido.cambios, {
      esShay: shay.has(actual.id),
      ultimoCambio: ultimos.get(String(actual.id)) ?? null,
    });
    const antes = Object.fromEntries(Object.keys(revision.envio).map((k) => [k, actual[k as keyof typeof actual]]));
    return {
      vista: { tipo: "campana", id: actual.id, nombre: actual.name, cambios: revision.cambios, errores: revision.errores, avisos: revision.avisos },
      revision,
      antes,
      anunciante: a,
    };
  }

  const hoy = new Date().toISOString().slice(0, 10);
  const [actual, campanas] = await Promise.all([ml.anuncio(tenantId, a, pedido.id), ml.campanas(tenantId, a, { desde: hoy, hasta: hoy })]);
  const revision = revisarCambioAnuncio(actual, pedido.cambios, {
    campanas: new Map(campanas.map((c) => [c.id, { nombre: c.name, esShay: shay.has(c.id) }])),
  });
  const antes = Object.fromEntries(
    Object.keys(revision.envio).map((k) => [k, k === "status" ? actual.status.toLowerCase() : actual.campaign_id])
  );
  return {
    vista: { tipo: "anuncio", id: actual.id, nombre: actual.title, cambios: revision.cambios, errores: revision.errores, avisos: revision.avisos },
    revision,
    antes,
    anunciante: a,
  };
}

/** Lo que pasaría, sin tocar nada: valores de ML de ahora contra lo pedido. */
export async function vistaPreviaDeCambio(tenantId: string, pedido: PedidoDeCambio): Promise<VistaPrevia> {
  return (await preparar(tenantId, pedido)).vista;
}

/**
 * Aplica un cambio y lo deja registrado, salga bien o mal (REQ-4, RN-5).
 *
 * Se vuelve a leer el estado de ML justo antes de mandar: lo que se compara es lo de ahora, no
 * lo que la pantalla tenía cargado.
 */
export async function aplicarCambio(
  tenantId: string,
  pedido: PedidoDeCambio,
  quien: { origen: "pantalla" | "claude"; usuario: string | null; confirmadoAparte: boolean }
): Promise<ResultadoCambio> {
  const p = await preparar(tenantId, pedido);
  if (p.vista.errores.length) return { estado: "rechazado", vista: p.vista, motivo: p.vista.errores.join(" ") };
  if (p.vista.avisos.some((x) => x.aparte) && !quien.confirmadoAparte) {
    return {
      estado: "rechazado",
      vista: p.vista,
      motivo: `Falta confirmar aparte: ${p.vista.avisos.filter((x) => x.aparte).map((x) => x.texto).join(" ")}`,
    };
  }

  let estado: "aplicado" | "error" = "aplicado";
  let respuesta: unknown;
  try {
    respuesta =
      pedido.tipo === "campana"
        ? await ml.cambiarCampanaEnMl(tenantId, p.anunciante, pedido.id, p.revision.envio as ml.CambioCampanaMl)
        : await ml.cambiarAnuncioEnMl(tenantId, p.anunciante, pedido.id, p.revision.envio as ml.CambioAnuncioMl);
  } catch (e) {
    estado = "error";
    respuesta = { error: e instanceof Error ? e.message : String(e) };
  }

  await prisma.cambioPublicidad.create({
    data: {
      tenantId,
      tipo: pedido.tipo,
      objetivoId: String(pedido.id),
      nombre: p.vista.nombre,
      antes: p.antes as Prisma.InputJsonValue,
      despues: p.revision.envio as Prisma.InputJsonValue,
      estado,
      respuesta: (respuesta ?? null) as Prisma.InputJsonValue,
      origen: quien.origen,
      usuario: quien.usuario,
    },
  });

  return estado === "aplicado"
    ? { estado, vista: p.vista, respuesta }
    : { estado, vista: p.vista, motivo: (respuesta as { error: string }).error };
}

export interface CambioRegistrado {
  id: string;
  tipo: string;
  objetivoId: string;
  nombre: string | null;
  antes: Record<string, unknown> | null;
  despues: Record<string, unknown>;
  estado: string;
  respuesta: unknown;
  origen: string;
  usuario: string | null;
  creadoEn: string;
}

export async function historialPublicidad(tenantId: string, limite = 200): Promise<CambioRegistrado[]> {
  const filas = await prisma.cambioPublicidad.findMany({ where: { tenantId }, orderBy: { creadoEn: "desc" }, take: limite });
  return filas.map((f) => ({
    id: f.id,
    tipo: f.tipo,
    objetivoId: f.objetivoId,
    nombre: f.nombre,
    antes: (f.antes ?? null) as Record<string, unknown> | null,
    despues: f.despues as Record<string, unknown>,
    estado: f.estado,
    respuesta: f.respuesta,
    origen: f.origen,
    usuario: f.usuario,
    creadoEn: f.creadoEn.toISOString(),
  }));
}
