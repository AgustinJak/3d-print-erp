import { mlFetch } from "@/lib/mercadolibre";

/**
 * Inversión en publicidad de Mercado Libre (Product Ads).
 *
 * La cuenta es compartida: algunas campañas son de Shay Juguetes y otras de
 * Sendero. La API no lo distingue —para ML es un solo anunciante— así que hay
 * que elegir a mano cuáles son de quién. Esa selección se guarda en la config
 * del tenant y se reusa todos los meses.
 *
 * Requiere el scope `urn:ml:mktp:ads:/read-only`, que se obtiene dando el
 * permiso "Publicidad de un producto" en el panel de ML **y reconectando la
 * cuenta**: un token viejo no lo trae.
 */

const HEADERS_ADS = { "api-version": "2" };

export interface CampanaMl {
  id: number;
  nombre: string;
  estado: string;
  costo: number;   // lo gastado en el rango pedido
  clicks: number;
  impresiones: number;
}

interface Advertiser {
  advertiser_id: number;
  site_id: string;
  advertiser_name: string;
}

export type ResultadoCampanas =
  | { ok: true; campanas: CampanaMl[] }
  | { ok: false; motivo: string };

const SIN_PERMISO =
  "La cuenta de Mercado Libre no tiene el permiso de publicidad. Hay que darlo en el " +
  "panel de ML y reconectar la cuenta: un token viejo no lo trae.";

const ML_CAIDO =
  "Mercado Libre no está respondiendo el servicio de publicidad. Es de su lado; " +
  "probá de nuevo en un rato.";

/** El anunciante de la cuenta. Se resuelve en cada llamada: no se hardcodea. */
async function getAnunciante(tenantId: string): Promise<Advertiser | null> {
  const r = await mlFetch<{ advertisers?: Advertiser[] }>(
    tenantId,
    "/advertising/advertisers?product_id=PADS",
    { headers: HEADERS_ADS }
  );
  return r.advertisers?.[0] ?? null;
}

/**
 * Campañas con lo que gastó cada una entre dos fechas (YYYY-MM-DD).
 *
 * Devuelve `null` si la cuenta todavía no tiene el permiso de publicidad, para
 * que la UI pueda explicar qué falta en vez de mostrar un error crudo.
 */
export async function campanasConCosto(
  tenantId: string,
  desde: string,
  hasta: string
): Promise<ResultadoCampanas> {
  let anunciante: Advertiser | null;
  try {
    anunciante = await getAnunciante(tenantId);
  } catch (e) {
    // Se distingue el permiso que falta de una caída de ML: son cosas muy
    // distintas y la primera la puede arreglar el usuario.
    return { ok: false, motivo: esCaida(e) ? ML_CAIDO : SIN_PERMISO };
  }
  if (!anunciante) return { ok: false, motivo: SIN_PERMISO };

  const path =
    `/marketplace/advertising/${anunciante.site_id}` +
    `/advertisers/${anunciante.advertiser_id}/product_ads/campaigns/search` +
    // limit 50: con 100 la API contesta 503 sin cuerpo.
    `?limit=50&offset=0&date_from=${desde}&date_to=${hasta}&metrics=cost,clicks,prints`;

  let r: { results?: Array<{ id: number; name: string; status: string; metrics?: { cost?: number; clicks?: number; prints?: number } }> };
  try {
    r = await mlFetch(tenantId, path, { headers: HEADERS_ADS });
  } catch (e) {
    return { ok: false, motivo: esCaida(e) ? ML_CAIDO : (e instanceof Error ? e.message : "error") };
  }

  const campanas = (r.results ?? [])
    .map((c) => ({
      id: c.id,
      nombre: c.name,
      estado: c.status,
      costo: c.metrics?.cost ?? 0,
      clicks: c.metrics?.clicks ?? 0,
      impresiones: c.metrics?.prints ?? 0,
    }))
    .sort((a, b) => b.costo - a.costo);

  return { ok: true, campanas };
}

/** ¿El error es de infraestructura de ML y no un problema de permisos? */
function esCaida(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : "";
  return /ML API 5[0-9][0-9]/.test(msg) || /no healthy upstream/i.test(msg);
}

/** Último día del mes, en formato YYYY-MM-DD. */
export function rangoMes(anio: number, mes: number): { desde: string; hasta: string } {
  const dd = (n: number) => String(n).padStart(2, "0");
  const ultimo = new Date(anio, mes, 0).getDate();
  return { desde: `${anio}-${dd(mes)}-01`, hasta: `${anio}-${dd(mes)}-${dd(ultimo)}` };
}
