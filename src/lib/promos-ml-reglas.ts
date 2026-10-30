/**
 * Las promos de Mercado Libre (docs/sdd/006, spec 010): qué promo tiene cada publicación, a cuáles
 * se puede sumar, qué avisar y qué mandarle a ML. Puro: lo que viene de ML entra ya leído.
 *
 * El ERP **nunca prende una promo solo** (Agustín, 2026-10-30): las campañas de ML a veces piden más
 * del 10 % y a veces conviene igual. Acá sólo se calcula; prender es una decisión de la pantalla.
 */

/** Una promo tal como la ve una publicación: en la que está, o una a la que se puede sumar. */
export interface PromoDePublicacion {
  /** null en el descuento propio (`PRICE_DISCOUNT`), que no tiene campaña. */
  id: string | null;
  tipo: string;
  subtipo: string | null;
  /** "started" | "pending" | "candidate" | … */
  estado: string;
  nombre: string;
  /** El precio con la promo; 0 o null en una candidata. */
  precio: number | null;
  original: number | null;
  desde: string | null;
  hasta: string | null;
  /** Entre qué precios deja ML poner la promo (candidatas). */
  minimo: number | null;
  maximo: number | null;
  sugerido: number | null;
  /** Los cupones: un % fijo, sin precio. */
  pctFijo: number | null;
  /** SMART y PRICE_MATCHING se aceptan con la oferta que propone ML. */
  ofertaId: string | null;
  /**
   * En la co-participación ML pone parte del descuento: cuánto pone ML y cuánto el vendedor, en % del
   * original. El 2026-10-30, una katana a 40 % menos: ML 2,4 %, Sendero 37,7 %.
   */
  pctMl: number | null;
  pctVendedor: number | null;
}

/** Una campaña del vendedor o de ML (`/seller-promotions/users/{id}`). */
export interface CampanaMl {
  id: string;
  tipo: string;
  subtipo: string | null;
  estado: string;
  nombre: string;
  desde: string | null;
  hasta: string | null;
  pctFijo: number | null;
}

export const NOMBRE_DE_TIPO: Record<string, string> = {
  SELLER_CAMPAIGN: "Campaña propia",
  PRICE_DISCOUNT: "Descuento propio",
  DEAL: "Oferta de ML",
  SMART: "Co-participación",
  PRICE_MATCHING: "Precio competitivo",
  LIGHTNING: "Relámpago",
  SMART_LIGHTNING: "Relámpago compartida",
  DOD: "Oferta del día",
  SELLER_COUPON_CAMPAIGN: "Cupón",
  MARKETPLACE_CAMPAIGN: "Campaña de ML",
  VOLUME: "Por volumen",
  PRE_NEGOTIATED: "Pre-negociada",
  UNHEALTHY_STOCK: "Stock sin movimiento",
};

export const nombreDeTipo = (tipo: string) => NOMBRE_DE_TIPO[tipo] ?? tipo;

/**
 * Las que el ERP sabe mandar. El PUT de una campaña propia se probó con el Carrete el 2026-10-30;
 * las demás siguen el mismo formato y la respuesta se verifica con lo que paga el cliente.
 * Relámpago y oferta del día piden stock y horarios: se prenden en ML.
 */
export const TIPOS_QUE_SE_PRENDEN = ["SELLER_CAMPAIGN", "PRICE_DISCOUNT", "DEAL", "SMART", "PRICE_MATCHING", "SELLER_COUPON_CAMPAIGN"];

/** Los que ML propone con su precio: se aceptan o no, el % no se elige. */
export const precioDeMl = (tipo: string) => tipo === "SMART" || tipo === "PRICE_MATCHING";

/** Los que ponen precio a la publicación (los cupones se aplican al pagar). */
export const conPrecio = (tipo: string) => tipo !== "SELLER_COUPON_CAMPAIGN";

/** Lo que llega de ML, normalizado. */
export function normalizarPromo(r: Record<string, unknown>): PromoDePublicacion {
  const num = (k: string) => (typeof r[k] === "number" && (r[k] as number) > 0 ? (r[k] as number) : null);
  const txt = (k: string) => (typeof r[k] === "string" && r[k] ? (r[k] as string) : null);
  return {
    id: txt("id"),
    tipo: txt("type") ?? "?",
    subtipo: txt("sub_type"),
    estado: txt("status") ?? "?",
    nombre: txt("name") ?? "",
    precio: num("price"),
    original: num("original_price"),
    desde: txt("start_date"),
    hasta: txt("finish_date"),
    minimo: num("min_discounted_price"),
    maximo: num("max_discounted_price"),
    sugerido: num("suggested_discounted_price"),
    pctFijo: num("fixed_percentage"),
    ofertaId: txt("offer_id") ?? txt("ref_id"),
    pctMl: num("meli_percentage"),
    pctVendedor: num("seller_percentage"),
  };
}

export function normalizarCampana(r: Record<string, unknown>): CampanaMl {
  const p = normalizarPromo(r);
  return { id: p.id ?? "", tipo: p.tipo, subtipo: p.subtipo, estado: p.estado, nombre: p.nombre, desde: p.desde, hasta: p.hasta, pctFijo: p.pctFijo };
}

/** El % de descuento de un precio sobre el original, con un decimal. */
export const pctDe = (precio: number, original: number) => (original > 0 ? Math.round((1 - precio / original) * 1000) / 10 : 0);

/** La promo en la que está la publicación y pone precio (no un cupón). */
export const activaDe = (promos: PromoDePublicacion[]) =>
  promos.find((p) => p.estado === "started" && conPrecio(p.tipo) && p.precio != null) ?? null;

/** Los cupones en los que está. */
export const cuponesDe = (promos: PromoDePublicacion[]) => promos.filter((p) => p.estado === "started" && !conPrecio(p.tipo));

/** Las que ya están programadas para arrancar. */
export const pendientesDe = (promos: PromoDePublicacion[]) => promos.filter((p) => p.estado === "pending");

/** A las que se puede sumar y el ERP sabe mandar. */
export const candidatasDe = (promos: PromoDePublicacion[]) =>
  promos.filter((p) => p.estado === "candidate" && TIPOS_QUE_SE_PRENDEN.includes(p.tipo));

/**
 * El descuento que pide y el que deja una candidata, en %: ML deja poner el precio entre `minimo`
 * y `maximo`. Pide = el descuento más chico posible; deja = el más grande.
 */
export function rangoDe(c: PromoDePublicacion, original: number): { pide: number | null; deja: number | null } {
  if (c.pctFijo != null) return { pide: c.pctFijo, deja: c.pctFijo };
  return {
    pide: c.maximo != null ? pctDe(c.maximo, original) : null,
    deja: c.minimo != null ? pctDe(c.minimo, original) : null,
  };
}

/**
 * La promo que supone el precio publicado (spec 003): la de la pieza o la general, salvo que el
 * cliente pague menos que el umbral y el publicado lo pase (RN-6: ahí se publica sin promo).
 */
export function promoEsperada(publicado: number, promoPct: number, umbral: number): number {
  if (!(promoPct > 0)) return 0;
  const final = publicado * (1 - promoPct / 100);
  return final < umbral && publicado >= umbral ? 0 : promoPct;
}

export type TipoDeAviso = "sin-promo" | "distinta" | "de-mas" | "vence";

export interface AvisoDePromo {
  tipo: TipoDeAviso;
  texto: string;
}

const TOLERANCIA = 0.5;
const DIAS_PARA_AVISAR = 3;

/** Qué avisar de una publicación (REQ-2 y REQ-6). */
export function avisosDe(
  esperada: number,
  activa: PromoDePublicacion | null,
  original: number,
  ahora: Date = new Date()
): AvisoDePromo[] {
  const avisos: AvisoDePromo[] = [];
  const tiene = activa?.precio != null ? pctDe(activa.precio, activa.original ?? original) : 0;
  if (!activa && esperada > 0) {
    avisos.push({ tipo: "sin-promo", texto: `Sin campaña: el precio supone ${esperada} % de promo y el cliente paga el precio entero.` });
  } else if (activa && esperada === 0) {
    avisos.push({ tipo: "de-mas", texto: `Tiene ${tiene} % (${activa.nombre || nombreDeTipo(activa.tipo)}) y el precio no está inflado para promo.` });
  } else if (activa && Math.abs(tiene - esperada) > TOLERANCIA) {
    avisos.push({ tipo: "distinta", texto: `Tiene ${tiene} % (${activa.nombre || nombreDeTipo(activa.tipo)}) y el precio supone ${esperada} %.` });
  }
  if (activa?.hasta) {
    const dias = (new Date(activa.hasta).getTime() - ahora.getTime()) / 86_400_000;
    if (dias >= 0 && dias < DIAS_PARA_AVISAR) {
      avisos.push({ tipo: "vence", texto: `La promo vence el ${activa.hasta.slice(0, 10)}.` });
    }
  }
  return avisos;
}

/**
 * El precio de la promo para un %: redondeado al peso, y si ML no lo deja, el más cercano que sí,
 * con el motivo. Para un cupón no hay precio.
 */
export function precioParaPct(c: PromoDePublicacion, original: number, pct: number): { precio: number | null; pct: number; ajustado: string | null } {
  if (!conPrecio(c.tipo)) return { precio: null, pct: c.pctFijo ?? pct, ajustado: null };
  if (precioDeMl(c.tipo)) {
    const deMl = c.precio != null ? pctDe(c.precio, original) : pct;
    return { precio: c.precio, pct: deMl, ajustado: c.pctVendedor != null ? `ML pone ${c.pctMl ?? 0} %, vos ${c.pctVendedor} %` : "ML pone el precio" };
  }
  let precio = Math.round(original * (1 - pct / 100));
  let ajustado: string | null = null;
  if (c.maximo != null && precio > c.maximo) {
    precio = Math.floor(c.maximo);
    ajustado = `ML pide al menos ${pctDe(precio, original)} %`;
  }
  if (c.minimo != null && precio < c.minimo) {
    precio = Math.ceil(c.minimo);
    ajustado = `ML deja hasta ${pctDe(precio, original)} %`;
  }
  return { precio, pct: pctDe(precio, original), ajustado };
}

export type AccionPromo = "sumar" | "cambiar" | "sacar";

export interface PedidoDePromo {
  mla: string;
  accion: AccionPromo;
  promocionId: string | null;
  promocionTipo: string;
  /** El precio con la promo; null en un cupón o al sacar. */
  precio: number | null;
}

/** Lo que se le manda a ML (path con query y cuerpo), o por qué no se puede. */
export function pedidoAMl(
  p: PedidoDePromo,
  ofertaId: string | null,
  hoy: Date = new Date()
): { metodo: "POST" | "PUT" | "DELETE"; path: string; cuerpo: Record<string, unknown> | null } | { error: string } {
  if (!TIPOS_QUE_SE_PRENDEN.includes(p.promocionTipo)) return { error: `${nombreDeTipo(p.promocionTipo)} se prende desde Mercado Libre.` };
  const base = `/seller-promotions/items/${p.mla}`;
  if (p.accion === "sacar") {
    const q = new URLSearchParams({ promotion_type: p.promocionTipo, app_version: "v2" });
    if (p.promocionId) q.set("promotion_id", p.promocionId);
    return { metodo: "DELETE", path: `${base}?${q}`, cuerpo: null };
  }
  const cuerpo: Record<string, unknown> = { promotion_type: p.promocionTipo };
  if (p.promocionId) cuerpo.promotion_id = p.promocionId;
  if (p.promocionTipo === "SMART" || p.promocionTipo === "PRICE_MATCHING") {
    if (!ofertaId) return { error: "ML no propuso una oferta para esta publicación." };
    cuerpo.offer_id = ofertaId;
  } else if (conPrecio(p.promocionTipo)) {
    if (p.precio == null || !(p.precio > 0)) return { error: "Falta el precio de la promo." };
    cuerpo.deal_price = p.precio;
  }
  if (p.promocionTipo === "PRICE_DISCOUNT") {
    // Un descuento propio dura lo que se le diga: un mes, como las campañas propias.
    const fin = new Date(hoy.getTime() + 30 * 86_400_000);
    cuerpo.start_date = hoy.toISOString().slice(0, 19);
    cuerpo.finish_date = fin.toISOString().slice(0, 19);
  }
  return { metodo: p.accion === "cambiar" ? "PUT" : "POST", path: `${base}?app_version=v2`, cuerpo };
}

/**
 * Si el cambio quedó en la lista de promos de la publicación: sumada o cambiada, la campaña aparece
 * en curso o pendiente (con el precio pedido); sacada, ya no aparece. La lista a veces tarda: un PUT
 * del Carrete siguió mostrando el precio viejo un rato. Por eso se mira junto con `quedo`.
 */
export function quedoEnPromos(p: PedidoDePromo, promos: PromoDePublicacion[]): boolean {
  const esa = promos.find((x) => (x.estado === "started" || x.estado === "pending") && x.tipo === p.promocionTipo && (p.promocionId == null || x.id === p.promocionId));
  if (p.accion === "sacar") return !esa;
  if (!esa) return false;
  return p.precio == null || esa.precio == null || Math.abs(esa.precio - p.precio) < 1;
}

/**
 * Si el cambio quedó: lo que paga el cliente después contra lo pedido. ML contesta 200 sin cambiar
 * nada cuando la publicación ya estaba en esa campaña (probado con el Carrete). Si la publicación
 * ya pagaba ese precio en otra campaña (la Ichigo, de "Q44" a "Q4" al mismo 10 %), esto da bien
 * aunque no se haya sumado: hace falta `quedoEnPromos` también.
 */
export function quedo(p: PedidoDePromo, pagaDespues: number | null, original: number): boolean {
  if (pagaDespues == null) return false;
  if (p.accion === "sacar") return Math.abs(pagaDespues - original) < 1;
  if (p.precio == null) return true; // cupón: no cambia lo que se publica
  return Math.abs(pagaDespues - p.precio) < 1;
}
