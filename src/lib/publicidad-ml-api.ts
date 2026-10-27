import { mlFetch } from "@/lib/mercadolibre";

/**
 * Product Ads de Mercado Libre: todo el acceso a la API en un solo archivo (docs/sdd/005).
 *
 * ML ya dio de baja una tanda de endpoints de publicidad en mayo de 2026. Si vuelve a pasar, se
 * cambia acá y nada más. La lectura de Finanzas › Shay (`ml-publicidad.ts`) es anterior y queda
 * como está.
 *
 * Lectura: `/advertising/$SITE/...`. Escritura: `/marketplace/advertising/$SITE/...`, como la
 * documenta ML (Global Selling; la doc de Argentina sólo publica la lectura). Todo con
 * `api-version: 2`, salvo el PUT de un ad group, que la doc muestra sin ese header.
 */

const V2 = { "api-version": "2" };

export interface Anunciante {
  advertiserId: number;
  siteId: string;
}

/** Las métricas que se piden. ML devuelve sólo las pedidas; las que faltan se toman como 0. */
export interface MetricasMl {
  cost: number;
  clicks: number;
  prints: number;
  direct_amount: number;
  indirect_amount: number;
  total_amount: number;
  units_quantity: number;
}

export interface CampanaMl {
  id: number;
  name: string;
  status: string;
  strategy: string;
  roas_target: number | null;
  budget: number;
  metrics: MetricasMl;
}

/** Lo que agrega el detalle de una campaña: qué parte de las impresiones posibles se llevó. */
export interface CuotaDeImpresiones {
  /** Fracciones (0,85 = 85 %). Las tres suman 1. */
  impression_share: number | null;
  lost_impression_share_by_budget: number | null;
  lost_impression_share_by_ad_rank: number | null;
}

/** Un anuncio. Para ML es un "ad group": una publicación, una familia o un producto de catálogo. */
export interface AnuncioMl {
  id: number;
  campaign_id: number;
  title: string;
  thumbnail: string | null;
  status: string;
  ad_group_type: "ITEM" | "FAMILY" | "CATALOG" | string;
  ad_group_external_id: string;
  metrics: MetricasMl;
}

export interface PublicacionDeMl {
  id: string;
  title: string;
  price: number;
  status: string;
  permalink: string | null;
  /** Como texto: es un número más grande de lo que JavaScript guarda sin redondear. */
  family_id: string | null;
  catalog_product_id: string | null;
}

export interface DiaMl {
  date: string;
  cost: number;
  total_amount: number;
}

export interface Rango {
  desde: string;
  hasta: string;
}

const METRICAS_CAMPANA = "clicks,prints,cost,direct_amount,indirect_amount,total_amount,units_quantity";
const METRICAS_ANUNCIO = "CLICKS,PRINTS,COST,DIRECT_AMOUNT,INDIRECT_AMOUNT,TOTAL_AMOUNT,UNITS_QUANTITY";

const fechas = (r: Rango) => `date_from=${r.desde}&date_to=${r.hasta}`;

function metricas(m: Partial<Record<keyof MetricasMl, number>> | undefined): MetricasMl {
  const n = (k: keyof MetricasMl) => (typeof m?.[k] === "number" && Number.isFinite(m[k]) ? (m[k] as number) : 0);
  return {
    cost: n("cost"),
    clicks: n("clicks"),
    prints: n("prints"),
    direct_amount: n("direct_amount"),
    indirect_amount: n("indirect_amount"),
    total_amount: n("total_amount"),
    units_quantity: n("units_quantity"),
  };
}

/** El anunciante de la cuenta. `null` si la cuenta no tiene Product Ads o falta el permiso. */
export async function anunciante(tenantId: string): Promise<Anunciante | null> {
  const r = await mlFetch<{ advertisers?: Array<{ advertiser_id: number; site_id: string }> }>(
    tenantId,
    "/advertising/advertisers?product_id=PADS",
    { headers: V2 }
  );
  const a = r.advertisers?.[0];
  return a ? { advertiserId: a.advertiser_id, siteId: a.site_id } : null;
}

/** Todas las campañas, con las métricas del rango. De a 50: con 100 la API contesta 503. */
export async function campanas(tenantId: string, a: Anunciante, r: Rango): Promise<CampanaMl[]> {
  const out: CampanaMl[] = [];
  for (let offset = 0; ; offset += 50) {
    const p = await mlFetch<{ paging?: { total: number }; results?: Array<CampanaMl & { metrics?: Partial<MetricasMl> }> }>(
      tenantId,
      `/advertising/${a.siteId}/advertisers/${a.advertiserId}/product_ads/campaigns/search?limit=50&offset=${offset}&${fechas(r)}&metrics=${METRICAS_CAMPANA}`,
      { headers: V2 }
    );
    for (const c of p.results ?? []) {
      out.push({
        id: c.id,
        name: c.name,
        status: c.status,
        strategy: String(c.strategy ?? "").toLowerCase(),
        roas_target: typeof c.roas_target === "number" ? c.roas_target : null,
        budget: Number(c.budget) || 0,
        metrics: metricas(c.metrics),
      });
    }
    if (!p.results?.length || offset + 50 >= (p.paging?.total ?? 0)) break;
  }
  return out;
}

/** Qué parte de las impresiones posibles se llevó la campaña y cuánto perdió por presupuesto. */
export async function cuotaDeImpresiones(tenantId: string, a: Anunciante, campanaId: number, r: Rango): Promise<CuotaDeImpresiones> {
  const d = await mlFetch<{ metrics?: Partial<CuotaDeImpresiones> }>(
    tenantId,
    `/advertising/${a.siteId}/product_ads/campaigns/${campanaId}?${fechas(r)}&metrics=impression_share,lost_impression_share_by_budget,lost_impression_share_by_ad_rank`,
    { headers: V2 }
  );
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    impression_share: n(d.metrics?.impression_share),
    lost_impression_share_by_budget: n(d.metrics?.lost_impression_share_by_budget),
    lost_impression_share_by_ad_rank: n(d.metrics?.lost_impression_share_by_ad_rank),
  };
}

/** Gasto y ventas día por día, de toda la cuenta (Shay incluida: ML no lo separa). */
export async function serieDiaria(tenantId: string, a: Anunciante, r: Rango): Promise<DiaMl[]> {
  const p = await mlFetch<{ results?: Array<Partial<DiaMl>> }>(
    tenantId,
    `/advertising/${a.siteId}/advertisers/${a.advertiserId}/product_ads/campaigns/search?limit=50&offset=0&${fechas(r)}&metrics=cost,total_amount&aggregation_type=daily`,
    { headers: V2 }
  );
  return (p.results ?? [])
    .filter((d): d is DiaMl => typeof d.date === "string")
    .map((d) => ({ date: d.date, cost: Number(d.cost) || 0, total_amount: Number(d.total_amount) || 0 }))
    .sort((x, y) => x.date.localeCompare(y.date));
}

/** Todos los anuncios de la cuenta con las métricas del rango. */
export async function anuncios(tenantId: string, a: Anunciante, r: Rango): Promise<AnuncioMl[]> {
  const out: AnuncioMl[] = [];
  const LIMITE = 500;
  for (let offset = 0; offset < 10_000; offset += LIMITE) {
    const p = await mlFetch<{ paging?: { total: number }; results?: Array<Omit<AnuncioMl, "metrics"> & { metrics?: Record<string, number> }> }>(
      tenantId,
      `/advertising/${a.siteId}/advertisers/${a.advertiserId}/product_ads/ad_groups/search?${fechas(r)}&limit=${LIMITE}&offset=${offset}&metrics=${METRICAS_ANUNCIO}`,
      { headers: V2 }
    );
    for (const g of p.results ?? []) {
      // Las métricas de los ad groups vienen en minúscula aunque se pidan en mayúscula.
      const m = Object.fromEntries(Object.entries(g.metrics ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
      out.push({
        id: g.id,
        campaign_id: g.campaign_id,
        title: g.title,
        thumbnail: g.thumbnail ?? null,
        status: String(g.status ?? "").toUpperCase(),
        ad_group_type: g.ad_group_type,
        ad_group_external_id: String(g.ad_group_external_id),
        metrics: metricas(m),
      });
    }
    if (!p.results?.length || offset + LIMITE >= (p.paging?.total ?? 0)) break;
  }
  return out;
}

/** Una campaña como está ahora, sin métricas: lo que se compara antes de cambiarla. */
export async function campana(tenantId: string, a: Anunciante, campanaId: number): Promise<Omit<CampanaMl, "metrics">> {
  const c = await mlFetch<Partial<CampanaMl>>(tenantId, `/advertising/${a.siteId}/product_ads/campaigns/${campanaId}`, { headers: V2 });
  return {
    id: Number(c.id ?? campanaId),
    name: c.name ?? "",
    status: String(c.status ?? ""),
    strategy: String(c.strategy ?? "").toLowerCase(),
    roas_target: typeof c.roas_target === "number" ? c.roas_target : null,
    budget: Number(c.budget) || 0,
  };
}

/** Un anuncio como está ahora, sin métricas. */
export async function anuncio(tenantId: string, a: Anunciante, anuncioId: number): Promise<Omit<AnuncioMl, "metrics">> {
  const g = await mlFetch<Partial<AnuncioMl>>(tenantId, `/advertising/${a.siteId}/product_ads/ad_groups/${anuncioId}`, { headers: V2 });
  return {
    id: Number(g.id ?? anuncioId),
    campaign_id: Number(g.campaign_id),
    title: g.title ?? "",
    thumbnail: g.thumbnail ?? null,
    status: String(g.status ?? "").toUpperCase(),
    ad_group_type: g.ad_group_type ?? "",
    ad_group_external_id: String(g.ad_group_external_id ?? ""),
  };
}

/** Corre `fn` sobre los elementos de a `n` por vez. */
async function enTandas<T, R>(xs: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < xs.length; i += n) out.push(...(await Promise.all(xs.slice(i, i + n).map(fn))));
  return out;
}

/**
 * Las publicaciones pedidas, con su familia y su producto de catálogo: es lo que permite saber
 * de qué publicación es cada anuncio. De a 20, el máximo de `/items?ids=`.
 */
export async function publicaciones(tenantId: string, mlas: string[]): Promise<PublicacionDeMl[]> {
  const ids = [...new Set(mlas)];
  const lotes: string[][] = [];
  for (let i = 0; i < ids.length; i += 20) lotes.push(ids.slice(i, i + 20));
  const atributos = "id,title,price,status,permalink,family_id,catalog_product_id";
  const respuestas = await enTandas(lotes, 4, (lote) =>
    mlFetch<Array<{ code: number; body: Partial<PublicacionDeMl> & { family_id?: string | number | null } }>>(
      tenantId,
      `/items?ids=${lote.join(",")}&attributes=${atributos}`,
      undefined,
      (t) => t.replace(/"family_id"\s*:\s*(\d+)/g, '"family_id":"$1"')
    )
  );
  return respuestas
    .flat()
    .filter((x) => x.code === 200 && x.body?.id)
    .map((x) => ({
      id: String(x.body.id),
      title: x.body.title ?? "",
      price: Number(x.body.price) || 0,
      status: x.body.status ?? "",
      permalink: x.body.permalink ?? null,
      family_id: x.body.family_id != null ? String(x.body.family_id) : null,
      catalog_product_id: x.body.catalog_product_id ?? null,
    }));
}

export interface CambioCampanaMl {
  budget?: number;
  status?: "active" | "paused";
  roas_target?: number;
  strategy?: "profitability" | "increase" | "visibility";
}

/** Cambia una campaña. Se manda sólo lo que cambia: la API acepta cualquier subconjunto. */
export async function cambiarCampanaEnMl(tenantId: string, a: Anunciante, campanaId: number, cambio: CambioCampanaMl): Promise<unknown> {
  return mlFetch(tenantId, `/marketplace/advertising/${a.siteId}/product_ads/campaigns/${campanaId}`, {
    method: "PUT",
    headers: { ...V2, "Content-Type": "application/json" },
    body: JSON.stringify(cambio),
  });
}

export interface CambioAnuncioMl {
  status?: "active" | "paused";
  campaign_id?: number;
}

/** Pausa, activa o mueve un anuncio a otra campaña. */
export async function cambiarAnuncioEnMl(tenantId: string, a: Anunciante, anuncioId: number, cambio: CambioAnuncioMl): Promise<unknown> {
  return mlFetch(tenantId, `/marketplace/advertising/${a.siteId}/product_ads/ad_groups/${anuncioId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cambio),
  });
}
