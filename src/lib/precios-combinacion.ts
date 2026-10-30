import { prisma } from "@/lib/prisma";
import { cargarContexto, componentesDeItem, type Contexto } from "@/lib/reservas";
import { costosPorFilaDeStock, type CostoDeFila } from "@/lib/costos-bodega";
import {
  aplicarPolitica,
  esRedondeo,
  GASTOS_MEDIDOS,
  politicaDeModelo,
  precioConPromo,
  REDONDEO_POR_DEFECTO,
  redondear,
  techoDeRedondeo,
  TRAMOS_MAYORISTA,
  TRAMOS_WEB,
  tresPrecios,
  type GastosVenta,
  type Politica,
  type Redondeo,
  type TresPrecios,
} from "@/lib/precios-formula";
import type { LecturaMl } from "@/lib/precios-ml";
import {
  costosDeLectura,
  opcionDe,
  costosDeOpcionUno,
  opcionUnoConMargen,
  opcionUnoFija,
  precioParaGanancia,
  tresPreciosErp,
} from "@/lib/precios-ml-publicacion";
import { tarifasGuardadas } from "@/lib/tarifas-ml";
import { pctMasAlto, type TarifasMl } from "@/lib/tarifas-ml-reglas";

/**
 * El precio de cada combinación que se vende (docs/sdd/003, spec 003).
 *
 * Bodega le pone precio a una pieza; lo que se vende es una combinación, la pieza más los insumos
 * de su receta. El ERP ya sabe las dos cosas —la pieza por `stock.bodega_model_id`, los insumos por
 * `reglas_insumo`— así que corre la misma fórmula que la calculadora (`precios-formula.ts`, del ERP desde
 * docs/sdd/006) con el costo de la combinación entera.
 *
 * Lo que se le pide margen es la impresión de la pieza. Todo lo demás —los insumos de la pieza en
 * Bodega y la funda de "Con Funda", aunque la funda también se imprima— va al costo, como lo trata
 * la calculadora: la ganancia es del producto y el insumo se cobra lo que cuesta.
 *
 * Sin dato no hay precio (RN-5): una combinación sin pieza enlazada, sin receta en Bodega o con un
 * insumo sin costo queda "falta costear" y no se propone nada. Un precio inventado se publica.
 */

export interface GastosDeVenta {
  gastos: GastosVenta;
  redondeo: Redondeo;
  /** false = Bodega todavía no subió sus gastos y se usan los medidos (la pantalla lo avisa). */
  deBodega: boolean;
  /**
   * De dónde salen (docs/sdd/006, spec 001): "erp" = `config_precios`, y entonces se calcula con
   * el motor del ERP (margen sobre el precio y lo que cobra ML de verdad); "bodega" o "medidos" =
   * como en el SDD 003, mientras el ERP no tenga su configuración.
   */
  origen: "erp" | "bodega" | "medidos";
}

/** Las claves de GastosVenta que vengan en `o`, sobre los gastos medidos. */
function gastosDesde(o: Record<string, unknown>): GastosVenta {
  const gastos = { ...GASTOS_MEDIDOS };
  const claves = [...Object.keys(GASTOS_MEDIDOS), "webEnvioReservaPct"] as Array<keyof GastosVenta>;
  for (const k of claves) {
    const v = o[k];
    const n = typeof v === "number" ? v : parseFloat(String(v));
    if (Number.isFinite(n)) gastos[k] = n;
  }
  return gastos;
}

/**
 * Los gastos de venta y el redondeo generales: los del ERP (`config_precios`) si el tenant ya los
 * tiene; si no, los que subió la calculadora de Bodega.
 */
export async function leerGastosDeVenta(tenantId?: string): Promise<GastosDeVenta> {
  if (tenantId) {
    const cfg = await prisma.configPrecios.findUnique({ where: { tenantId } });
    if (cfg && cfg.gastos && typeof cfg.gastos === "object") {
      const o = cfg.gastos as Record<string, unknown>;
      return { gastos: gastosDesde(o), redondeo: esRedondeo(o.redondeo) ? o.redondeo : REDONDEO_POR_DEFECTO, deBodega: false, origen: "erp" };
    }
  }
  const filas = await prisma.$queryRaw<Array<{ gastos_venta: unknown }>>`
    SELECT gastos_venta FROM bodega.cost_settings WHERE id = 'default'`;
  const g = filas[0]?.gastos_venta;
  if (!g || typeof g !== "object") return { gastos: GASTOS_MEDIDOS, redondeo: REDONDEO_POR_DEFECTO, deBodega: false, origen: "medidos" };
  const o = g as Record<string, unknown>;
  return { gastos: gastosDesde(o), redondeo: esRedondeo(o.redondeo) ? o.redondeo : REDONDEO_POR_DEFECTO, deBodega: true, origen: "bodega" };
}

/** Lo que guardó Bodega la última vez que tocaron "Guardar precios" en la pieza. */
export interface FotoDeBodega {
  ml: number;
  mlPublicado: number;
  web: number;
  personalizado: number;
  costo: number;
  guardadoEn: string;
}

interface DeBodega {
  politica: Politica;
  foto: FotoDeBodega | null;
}

function leerFoto(v: unknown): FotoDeBodega | null {
  if (!v || typeof v !== "object") return null;
  const f = v as Record<string, unknown>;
  const n = (k: string) => (typeof f[k] === "number" && Number.isFinite(f[k]) ? (f[k] as number) : null);
  const [ml, web, personalizado, costo] = [n("ml"), n("web"), n("personalizado"), n("costo")];
  if (ml == null || web == null || personalizado == null || costo == null || typeof f.guardadoEn !== "string") return null;
  return { ml, mlPublicado: n("mlPublicado") ?? ml, web, personalizado, costo, guardadoEn: f.guardadoEn };
}

/** La política (margen, redondeo, promo) y la foto de precios de cada pieza de Bodega. */
async function leerPiezasDeBodega(): Promise<Map<string, DeBodega>> {
  const filas = await prisma.$queryRaw<
    Array<{ id: string; margen: number | null; redondeo: string | null; promo_ml: number | null; precios: unknown }>
  >`SELECT id, margen::float8 AS margen, redondeo, promo_ml::float8 AS promo_ml, precios FROM bodega.models`;
  return new Map(
    filas.map((f) => [f.id, { politica: politicaDeModelo({ margen: f.margen, redondeo: f.redondeo, promoMl: f.promo_ml }), foto: leerFoto(f.precios) }])
  );
}

export type MotivoFalta = "sin_pieza" | "pieza_sin_bodega" | "pieza_sin_receta" | "insumo_sin_costo" | "sin_precio_posible";

export interface Falta {
  motivo: MotivoFalta;
  /** De qué pieza o insumo se habla. */
  etiqueta: string;
}

export interface CostoDeCombinacion {
  /** A esto se le pide margen: la impresión de la pieza, con el precio de su material. */
  fabricacion: number;
  /** Al costo: los insumos de la pieza en Bodega más los de la receta. */
  insumos: number;
  pieza: {
    stockId: string;
    etiqueta: string;
    bodegaModelId: string;
    fabricacion: number;
    insumos: number;
    /** Bodega tiene la receta pero nadie le cargó insumos: se cuentan en cero y puede estar corto. */
    insumosSinDeclarar: boolean;
  };
  receta: Array<{ stockId: string; etiqueta: string; cantidad: number; costoUnitario: number }>;
}

export interface PrecioDeCombinacion {
  combinacionId: string;
  modeloId: string;
  modelo: string;
  nombre: string;
  sku: string | null;
  variantes: string[];
  costo: CostoDeCombinacion | null;
  /** Vacía = hay precio. */
  falta: Falta[];
  /** Con qué se calculó: la política de la pieza en Bodega, o la general. */
  politica: { margen: number; redondeo: Redondeo; promo: number; propia: boolean };
  precios: TresPrecios | null;
  /** Lo último que guardó Bodega para la pieza, para comparar. */
  foto: FotoDeBodega | null;
}

/** Lo que usa el motor del ERP, además de lo de siempre (docs/sdd/006). */
export interface DelErp {
  tarifas: TarifasMl | null;
  /** La política propia de cada producto del ERP, y su precio de ML fijo si tiene. */
  modelos: Map<string, { politica: Politica; precioMlFijo: number | null; categoriaMl: string | null }>;
  /** La categoría de ML de cada combinación, la de una publicación suya ya leída. */
  categorias: Map<string, string>;
}

export interface ContextoDePrecios {
  general: GastosDeVenta;
  reservas: Contexto;
  costos: Map<string, CostoDeFila>;
  bodegaDeFila: Map<string, string | null>;
  piezas: Map<string, DeBodega>;
  /** null = todavía se calcula como en el SDD 003. */
  erp: DelErp | null;
}

export async function cargarDelErp(tenantId: string): Promise<DelErp> {
  const [tarifas, modelos, mapeos] = await Promise.all([
    tarifasGuardadas(tenantId),
    prisma.modelo.findMany({ where: { tenantId }, select: { id: true, margen: true, promoMl: true, redondeo: true, precioMlFijo: true, categoriaMl: true } }),
    prisma.mapeoCanal.findMany({ where: { tenantId, canal: "mercadolibre", ignorar: false, combinacionId: { not: null } }, select: { combinacionId: true, precioLectura: true } }),
  ]);
  const categorias = new Map<string, string>();
  for (const m of mapeos) {
    const cat = (m.precioLectura as unknown as LecturaMl | null)?.categoria;
    if (cat && !categorias.has(m.combinacionId!)) categorias.set(m.combinacionId!, cat);
  }
  return {
    tarifas,
    modelos: new Map(modelos.map((m) => [m.id, { politica: politicaDeModelo(m), precioMlFijo: m.precioMlFijo, categoriaMl: m.categoriaMl }])),
    categorias,
  };
}

/** La comisión de ML de una combinación: la de su categoría; si no se sabe, la más alta. */
export function pctDeCombinacion(cx: ContextoDePrecios, combinacionId: string, modeloId: string, categoria?: string | null): number {
  const t = cx.erp?.tarifas;
  const cat = categoria ?? cx.erp?.categorias.get(combinacionId) ?? cx.erp?.modelos.get(modeloId)?.categoriaMl ?? null;
  return (cat ? t?.categorias[cat] : undefined) ?? pctMasAlto(t ?? null) ?? cx.general.gastos.mlComisionPct;
}

/** Todo lo que hace falta para calcular cualquier combinación del tenant, de una vez. */
export async function cargarContextoDePrecios(tenantId: string): Promise<ContextoDePrecios> {
  const [general, reservas, costos, filas, piezas] = await Promise.all([
    leerGastosDeVenta(tenantId),
    cargarContexto(prisma, tenantId),
    costosPorFilaDeStock(tenantId),
    prisma.stock.findMany({ where: { tenantId }, select: { id: true, bodegaModelId: true } }),
    leerPiezasDeBodega(),
  ]);
  const erp = general.origen === "erp" ? await cargarDelErp(tenantId) : null;
  return { general, reservas, costos, bodegaDeFila: new Map(filas.map((f) => [f.id, f.bodegaModelId])), piezas, erp };
}

/** Los gastos con que se calcula una combinación: los generales con el margen y la promo de su pieza. */
export function gastosDe(general: GastosVenta, politica: PrecioDeCombinacion["politica"]): GastosVenta {
  return { ...general, margenMinorista: politica.margen, mlPromoPct: politica.promo };
}

export function precioDeCombinacion(
  c: { id: string; modeloId: string; nombre: string; sku: string | null; variantes: string[] },
  cx: ContextoDePrecios
): PrecioDeCombinacion {
  const componentes = componentesDeItem(
    { modeloId: c.modeloId, cantidad: 1, variantesInfo: null, combinacion: { modeloId: c.modeloId, variantes: c.variantes } },
    cx.reservas,
    "combinacion"
  );
  const falta: Falta[] = [];

  // La pieza: la de la opción del grupo "otra pieza", o la del producto (RN-1).
  const comp = componentes.find((x) => x.tipo === "producto");
  let pieza: CostoDeCombinacion["pieza"] | null = null;
  if (!comp?.stockId) falta.push({ motivo: "sin_pieza", etiqueta: comp?.etiqueta ?? c.nombre });
  else {
    const bodegaModelId = cx.bodegaDeFila.get(comp.stockId) ?? null;
    const costo = cx.costos.get(comp.stockId);
    if (!bodegaModelId) falta.push({ motivo: "pieza_sin_bodega", etiqueta: comp.etiqueta });
    else if (!costo) falta.push({ motivo: "pieza_sin_receta", etiqueta: comp.etiqueta });
    else {
      pieza = {
        stockId: comp.stockId,
        etiqueta: comp.etiqueta,
        bodegaModelId,
        fabricacion: costo.fab,
        insumos: costo.insumos,
        insumosSinDeclarar: costo.insumosSinDeclarar,
      };
    }
  }

  // Los insumos de la receta, al costo: el de una funda es su impresión más sus insumos.
  const receta: CostoDeCombinacion["receta"] = [];
  for (const x of componentes) {
    if (x.tipo !== "insumo" || !x.stockId) continue;
    const costo = cx.costos.get(x.stockId);
    if (!costo) falta.push({ motivo: "insumo_sin_costo", etiqueta: x.etiqueta });
    else receta.push({ stockId: x.stockId, etiqueta: x.etiqueta, cantidad: x.necesita, costoUnitario: costo.total });
  }

  const deBodega = pieza ? cx.piezas.get(pieza.bodegaModelId) : undefined;
  // Con la configuración del ERP manda la política del producto en el ERP. De Bodega se sigue
  // tomando el redondeo y la promo de la pieza, no el margen: era sobre otra cuenta (spec 002).
  const delErp = cx.erp?.modelos.get(c.modeloId);
  const propiaPolitica: Politica = cx.erp
    ? {
        margen: delErp?.politica.margen ?? null,
        redondeo: delErp?.politica.redondeo ?? deBodega?.politica.redondeo ?? null,
        promo: delErp?.politica.promo ?? deBodega?.politica.promo ?? null,
      }
    : (deBodega?.politica ?? { margen: null, redondeo: null, promo: null });
  const p = aplicarPolitica(cx.general.gastos, cx.general.redondeo, propiaPolitica);
  const politica = {
    margen: p.gastos.margenMinorista,
    redondeo: p.redondeo,
    promo: p.gastos.mlPromoPct,
    propia: Object.values(propiaPolitica).some((v) => v != null),
  };

  const base = { combinacionId: c.id, modeloId: c.modeloId, modelo: cx.reservas.modelos.get(c.modeloId) ?? "", nombre: c.nombre, sku: c.sku, variantes: c.variantes, politica, foto: deBodega?.foto ?? null };
  if (!pieza || falta.length) return { ...base, costo: null, falta, precios: null };

  const costo: CostoDeCombinacion = {
    fabricacion: pieza.fabricacion,
    insumos: pieza.insumos + receta.reduce((a, r) => a + r.costoUnitario * r.cantidad, 0),
    pieza,
    receta,
  };
  const precios = cx.erp
    ? tresPreciosErp(p.gastos, costo.fabricacion, costo.insumos, p.redondeo, {
        pct: pctDeCombinacion(cx, c.id, c.modeloId),
        tarifas: cx.erp.tarifas,
        precioFijo: delErp?.precioMlFijo ?? null,
      })
    : tresPrecios(p.gastos, costo.fabricacion, costo.insumos, p.redondeo);
  // Los gastos más el margen se comen todo el precio: la calculadora tampoco da número.
  if (![precios.ml, precios.web, precios.personalizado].every(Number.isFinite)) {
    return { ...base, costo, falta: [{ motivo: "sin_precio_posible", etiqueta: pieza.etiqueta }], precios: null };
  }
  return { ...base, costo, falta, precios };
}

/** Las combinaciones activas de los productos activos, con su precio. */
export async function preciosDeCombinaciones(
  tenantId: string,
  filtro: { modeloIds?: string[] } = {},
  cx?: ContextoDePrecios
): Promise<PrecioDeCombinacion[]> {
  const [contexto, combinaciones] = await Promise.all([
    cx ?? cargarContextoDePrecios(tenantId),
    prisma.combinacion.findMany({
      where: {
        tenantId,
        activo: true,
        modelo: { activo: true, consolidadoEnId: null },
        ...(filtro.modeloIds ? { modeloId: { in: filtro.modeloIds } } : {}),
      },
      select: { id: true, modeloId: true, nombre: true, sku: true, variantes: true },
      orderBy: { nombre: "asc" },
    }),
  ]);
  return combinaciones.map((c) => precioDeCombinacion(c, contexto));
}

/**
 * El precio de una clave de canal (RN-3). Un pack de N unidades vale N × el precio del canal con
 * el descuento del tramo por cantidad que le toca (desde 5, 10 % menos; desde 10, 20 %; desde 20,
 * 30 %), redondeado como la pieza. En ML es el precio a publicar: con la promo, inflado.
 */
export function precioDeClave(
  p: PrecioDeCombinacion,
  canal: "mercadolibre" | "shop",
  unidades: number,
  general: GastosVenta,
  erp?: { cx: ContextoDePrecios; mla: string | null; lectura: LecturaMl | null }
): number | null {
  if (!p.precios) return null;
  const n = Math.max(1, Math.floor(unidades));
  if (erp?.cx.erp && p.costo) return precioDeClaveErp(p, canal, n, erp.cx, erp.mla, erp.lectura);
  if (n === 1) return canal === "mercadolibre" ? p.precios.mlPublicado : p.precios.web;

  const g = gastosDe(general, p.politica);
  const deBodega = canal === "mercadolibre" ? "ml" : "web";
  const descuento = [...TRAMOS_MAYORISTA].reverse().find((t) => n >= t.desde)?.descuento ?? 0;
  const crudo = n * (deBodega === "ml" ? p.precios.ml : p.precios.web) * (1 - descuento / 100);
  const techo = techoDeRedondeo(g, deBodega, crudo);
  const total = redondear(crudo, p.politica.redondeo, techo);
  return deBodega === "ml" ? precioConPromo(total, g.mlPromoPct, techo).publicado : total;
}

/**
 * El precio de una clave con la configuración del ERP (docs/sdd/006, specs 003, 006 y 009).
 *
 * - ML: la opción 1 de esas unidades (un pack se calcula entero, con un solo cargo fijo y un solo
 *   envío), y la publicación sube hasta dejar lo mismo con sus costos: cuotas, envío gratis,
 *   comisión de su categoría. Con el precio fijo del producto, la opción 1 es ese precio.
 * - Shop: la web, y un pack con el tramo por cantidad de la web.
 */
function precioDeClaveErp(
  p: PrecioDeCombinacion,
  canal: "mercadolibre" | "shop",
  n: number,
  cx: ContextoDePrecios,
  mla: string | null,
  lectura: LecturaMl | null
): number | null {
  const g = gastosDe(cx.general.gastos, p.politica);
  if (canal === "shop") {
    if (n === 1) return p.precios!.web;
    const descuento = [...TRAMOS_WEB].reverse().find((t) => n >= t.desde)?.descuento ?? 0;
    return Math.round(redondear(n * p.precios!.web * (1 - descuento / 100), p.politica.redondeo));
  }
  const erp = cx.erp!;
  const fab = p.costo!.fabricacion * n;
  const ins = p.costo!.insumos * n;
  const pct = pctDeCombinacion(cx, p.combinacionId, p.modeloId, lectura?.categoria);
  const fijo = n === 1 ? (erp.modelos.get(p.modeloId)?.precioMlFijo ?? null) : null;
  const uno = costosDeOpcionUno(g, pct);
  const op1 = fijo != null ? opcionUnoFija(g, fab, ins, fijo, uno, erp.tarifas) : opcionUnoConMargen(g, fab, ins, p.politica.redondeo, uno, erp.tarifas);
  if (!lectura?.tipo || !mla) return op1.publicado;
  // La publicación de la opción 1 de un producto con precio fijo va en ese número exacto: es lo
  // que eligió Agustín. Recalcularla desde la ganancia la corría unos pesos por el redondeo.
  if (fijo != null && opcionDe(lectura) === 1 && !lectura.envioGratis) return fijo;
  const r = precioParaGanancia(g, fab, ins, p.politica.redondeo, op1.ganancia, costosDeLectura(lectura, mla, erp.tarifas, g, pct), erp.tarifas);
  return Number.isFinite(r.publicado) ? r.publicado : null;
}

export interface PrecioDeVentaErp {
  modeloId: string;
  /** El de personalizados de la combinación más barata; null si alguna activa no tiene precio. */
  precioVenta: number | null;
  base: string | null;
  /** Por opción: lo que su combinación cuesta de más sobre la base. */
  adicionales: Array<{ varianteId: string; precioAdicional: number }>;
  /** Combinaciones de varias opciones donde base + adicionales no da su precio exacto. */
  desvios: Array<{ combinacionId: string; precio: number; suma: number }>;
  /** Las combinaciones activas sin precio, que frenan la propuesta. */
  falta: string[];
}

/**
 * El precio de venta del ERP, el que propone el diálogo de pedido (RN-4): el producto vale lo que
 * su combinación más barata en personalizados, y cada opción suma la diferencia entre su
 * combinación y esa. Así el pedido a mano suma lo mismo que da la combinación.
 *
 * Si falta el precio de alguna combinación activa no se propone nada: la que falta podría ser la
 * más barata, y entonces la base estaría mal para todas.
 */
export function precioDeVentaErp(modeloId: string, combinaciones: PrecioDeCombinacion[]): PrecioDeVentaErp {
  const delModelo = combinaciones.filter((c) => c.modeloId === modeloId);
  const falta = delModelo.filter((c) => !c.precios).map((c) => c.nombre);
  const vacio = { modeloId, precioVenta: null, base: null, adicionales: [], desvios: [], falta };
  if (!delModelo.length || falta.length) return vacio;

  const pers = (c: PrecioDeCombinacion) => c.precios!.personalizado;
  const base = [...delModelo].sort((a, b) => pers(a) - pers(b) || a.variantes.length - b.variantes.length || a.nombre.localeCompare(b.nombre, "es"))[0];
  const enBase = new Set(base.variantes);

  // Para cada opción, la combinación que la tiene y en lo demás coincide con la base.
  const adicional = new Map<string, number>(base.variantes.map((v) => [v, 0]));
  const opciones = new Set(delModelo.flatMap((c) => c.variantes));
  for (const v of opciones) {
    if (adicional.has(v)) continue;
    const candidata = delModelo
      .filter((c) => c.variantes.includes(v) && c.variantes.every((u) => u === v || enBase.has(u)))
      .sort((a, b) => b.variantes.length - a.variantes.length)[0];
    if (candidata) adicional.set(v, pers(candidata) - pers(base));
  }

  const desvios: PrecioDeVentaErp["desvios"] = [];
  for (const c of delModelo) {
    if (c.variantes.some((v) => !adicional.has(v))) continue;
    const suma = pers(base) + c.variantes.reduce((a, v) => a + adicional.get(v)!, 0);
    if (Math.abs(suma - pers(c)) >= 1) desvios.push({ combinacionId: c.combinacionId, precio: pers(c), suma });
  }

  return {
    modeloId,
    precioVenta: pers(base),
    base: base.combinacionId,
    adicionales: [...adicional].map(([varianteId, precioAdicional]) => ({ varianteId, precioAdicional })),
    desvios,
    falta,
  };
}
