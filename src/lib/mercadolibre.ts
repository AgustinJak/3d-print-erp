import { prisma } from "@/lib/prisma";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Cliente de Mercado Libre.
 *
 * Maneja:
 *  - OAuth 2.0 (authorization code + refresh token)
 *  - Auto-refresh del access_token cuando está por expirar
 *  - Helpers para consultar orders y payments
 *
 * Variables de entorno requeridas:
 *  - ML_CLIENT_ID
 *  - ML_CLIENT_SECRET
 *  - ML_REDIRECT_URI    (ej: https://3d-print-erp.vercel.app/api/ml/oauth/callback)
 *  - ML_STATE_SECRET    (secreto para firmar el `state` del OAuth; cualquier string largo)
 */

const ML_API = "https://api.mercadolibre.com";
// Argentina usa el dominio .com.ar para autorización
const ML_AUTH = "https://auth.mercadolibre.com.ar/authorization";

// Margen de seguridad: refrescamos el token si le quedan menos de 5 min de vida.
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export function getMlConfig() {
  const clientId = process.env.ML_CLIENT_ID;
  const clientSecret = process.env.ML_CLIENT_SECRET;
  const redirectUri = process.env.ML_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("ML_CLIENT_ID / ML_CLIENT_SECRET / ML_REDIRECT_URI no configurados");
  }
  return { clientId, clientSecret, redirectUri };
}

/* ───────────────────────── OAuth: state firmado (CSRF) ───────────────────────── */

function getStateSecret(): string {
  return process.env.ML_STATE_SECRET || process.env.NEXTAUTH_SECRET || "ml-state-fallback";
}

/** Qué cuenta se está conectando: la principal (la de siempre) u otra más (docs/sdd/010). */
export type ModoConexion = "principal" | "otra";

/**
 * Genera un `state` firmado que incluye tenantId + timestamp. Para conectar otra cuenta, el tenant
 * va con el sufijo `~otra`: el formato sigue siendo de tres partes y un state viejo sigue valiendo.
 */
export function buildOAuthState(tenantId: string, modo: ModoConexion = "principal"): string {
  const payload = `${modo === "otra" ? `${tenantId}~otra` : tenantId}.${Date.now()}`;
  const sig = createHmac("sha256", getStateSecret()).update(payload).digest("hex");
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

/** Valida un `state` firmado. Devuelve el tenantId y el modo si es válido (y no expiró). */
export function parseOAuthState(state: string): { tenantId: string; modo: ModoConexion } | null {
  try {
    const decoded = Buffer.from(state, "base64url").toString("utf-8");
    const parts = decoded.split(".");
    if (parts.length !== 3) return null;
    const [tenantId, ts, sig] = parts;
    const expected = createHmac("sha256", getStateSecret())
      .update(`${tenantId}.${ts}`)
      .digest("hex");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    // El state vale 15 minutos
    if (Date.now() - parseInt(ts, 10) > 15 * 60 * 1000) return null;
    return tenantId.endsWith("~otra") ? { tenantId: tenantId.slice(0, -"~otra".length), modo: "otra" } : { tenantId, modo: "principal" };
  } catch {
    return null;
  }
}

/** URL a la que redirigir al usuario para que autorice la app. */
export function buildAuthorizationUrl(tenantId: string, modo: ModoConexion = "principal"): string {
  const { clientId, redirectUri } = getMlConfig();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state: buildOAuthState(tenantId, modo),
  });
  return `${ML_AUTH}?${params.toString()}`;
}

/* ───────────────────────── Token exchange / refresh ───────────────────────── */

interface MlTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number; // segundos (típicamente 21600 = 6h)
  scope: string;
  user_id: number;
  refresh_token: string;
}

async function postToken(body: Record<string, string>): Promise<MlTokenResponse> {
  const res = await fetch(`${ML_API}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(body).toString(),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(
      `ML token error ${res.status}: ${json?.message || json?.error || JSON.stringify(json)}`
    );
  }
  return json as MlTokenResponse;
}

/** Intercambia el `code` del callback por tokens. */
export async function exchangeCodeForTokens(code: string): Promise<MlTokenResponse> {
  const { clientId, clientSecret, redirectUri } = getMlConfig();
  return postToken({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  });
}

async function refreshTokens(refreshToken: string): Promise<MlTokenResponse> {
  const { clientId, clientSecret } = getMlConfig();
  return postToken({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });
}

const tokensDe = (token: MlTokenResponse) => ({
  accessToken: token.access_token,
  refreshToken: token.refresh_token,
  expiresAt: new Date(Date.now() + token.expires_in * 1000),
  scope: token.scope,
});

/**
 * Guarda la cuenta que acaba de autorizar el ERP (docs/sdd/010). Si ya estaba conectada (el mismo
 * usuario de ML), sólo renueva sus tokens. Si no:
 * - `principal`: reemplaza a la principal, como antes de haber varias cuentas; si no hay, la crea.
 * - `otra`: la suma como una cuenta más, salvo que el negocio no tenga ninguna, y entonces es la
 *   principal.
 */
export async function guardarCuentaConectada(
  tenantId: string,
  token: MlTokenResponse,
  nickname: string | null,
  modo: ModoConexion
): Promise<{ id: string; nueva: boolean; principal: boolean }> {
  const mlUserId = String(token.user_id);
  const datos = { ...tokensDe(token), ...(nickname ? { nickname } : {}) };
  const ya = await prisma.cuentaMercadolibre.findUnique({ where: { tenantId_mlUserId: { tenantId, mlUserId } } });
  if (ya) {
    await prisma.cuentaMercadolibre.update({ where: { id: ya.id }, data: datos });
    return { id: ya.id, nueva: false, principal: ya.principal };
  }
  const principal = await prisma.cuentaMercadolibre.findFirst({ where: { tenantId, principal: true } });
  if (modo === "principal" && principal) {
    await prisma.cuentaMercadolibre.update({ where: { id: principal.id }, data: { ...datos, mlUserId } });
    return { id: principal.id, nueva: false, principal: true };
  }
  const creada = await prisma.cuentaMercadolibre.create({
    data: { tenantId, mlUserId, nickname, nombre: principal ? nickname : (nickname ?? null), principal: !principal, ...tokensDe(token) },
  });
  return { id: creada.id, nueva: true, principal: creada.principal };
}

/** Quién es el dueño de un token recién emitido: para nombrar la cuenta antes de guardarla. */
export async function usuarioDelToken(accessToken: string): Promise<{ id: number; nickname: string } | null> {
  const r = await fetch(`${ML_API}/users/me`, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } });
  return r.ok ? ((await r.json()) as { id: number; nickname: string }) : null;
}

/* ───────────────────────── Cliente autenticado ───────────────────────── */

/**
 * Qué cuenta de ML usar (docs/sdd/010): su id en `cuentas_ml`. Sin cuenta, la principal: todo lo
 * que existía antes de haber varias cuentas sigue yendo a la de siempre.
 */
export type CuentaMl = string | null | undefined;

/** La fila de la cuenta: la pedida, o la principal. Nunca otra cuenta en lugar de la principal. */
function filaDeCuenta(tenantId: string, cuenta?: CuentaMl) {
  return prisma.cuentaMercadolibre.findFirst({ where: cuenta ? { id: cuenta, tenantId } : { tenantId, principal: true } });
}

export interface MlAccount {
  id: string;
  tenantId: string;
  mlUserId: string;
  nickname: string | null;
  nombre: string | null;
  principal: boolean;
  scope: string | null;
  expiresAt: Date;
}

const deFila = (c: NonNullable<Awaited<ReturnType<typeof filaDeCuenta>>>): MlAccount => ({
  id: c.id,
  tenantId: c.tenantId,
  mlUserId: c.mlUserId,
  nickname: c.nickname,
  nombre: c.nombre,
  principal: c.principal,
  scope: c.scope,
  expiresAt: c.expiresAt,
});

/** Devuelve la cuenta ML conectada del tenant: la pedida, o la principal (o null si no hay). */
export async function getMlAccount(tenantId: string, cuenta?: CuentaMl): Promise<MlAccount | null> {
  const fila = await filaDeCuenta(tenantId, cuenta);
  return fila ? deFila(fila) : null;
}

/** Todas las cuentas del negocio, la principal primero. */
export async function cuentasMl(tenantId: string): Promise<MlAccount[]> {
  const filas = await prisma.cuentaMercadolibre.findMany({ where: { tenantId }, orderBy: [{ principal: "desc" }, { creadoEn: "asc" }] });
  return filas.map(deFila);
}

/**
 * Devuelve un access_token válido para el tenant, refrescándolo si está
 * por expirar. Lanza error si el tenant no tiene cuenta conectada.
 */
export async function getValidAccessToken(tenantId: string, cuentaId?: CuentaMl): Promise<string> {
  const cuenta = await filaDeCuenta(tenantId, cuentaId);
  if (!cuenta) {
    throw new Error(`No hay cuenta de Mercado Libre conectada para el tenant "${tenantId}"${cuentaId ? ` (cuenta ${cuentaId})` : ""}`);
  }

  const expiraEn = cuenta.expiresAt.getTime() - Date.now();
  if (expiraEn > REFRESH_MARGIN_MS) {
    return cuenta.accessToken;
  }

  // Token expirado o por expirar → refrescar
  return refrescar(cuenta);
}

/**
 * Refresca el token, sabiendo que no somos los únicos que lo usan.
 *
 * El ERP desplegado y los procesos locales (scripts, el MCP de publicidad de docs/sdd/005)
 * comparten la misma cuenta. ML gasta el refresh token en cada uso: si dos procesos refrescan a
 * la vez, el segundo falla con `invalid_grant`. Para ese momento el primero ya guardó un token
 * nuevo, así que se relee la cuenta y, si cambió, se usa ese.
 */
async function refrescar(cuenta: { id: string; accessToken: string; refreshToken: string }): Promise<string> {
  try {
    const nuevo = await refreshTokens(cuenta.refreshToken);
    await prisma.cuentaMercadolibre.update({ where: { id: cuenta.id }, data: tokensDe(nuevo) });
    return nuevo.access_token;
  } catch (e) {
    const actual = await prisma.cuentaMercadolibre.findUnique({ where: { id: cuenta.id } });
    if (actual && actual.refreshToken !== cuenta.refreshToken) return actual.accessToken;
    throw e;
  }
}

/**
 * Fetch autenticado contra la API de ML. Reintenta una vez ante 401
 * forzando refresh del token.
 *
 * `antesDeLeer` toca el texto de la respuesta antes del `JSON.parse`. Existe por los ids que ML
 * manda como números más grandes de lo que JavaScript representa sin redondear (el `family_id`
 * de una publicación): hay que pasarlos a texto antes de que el parse los rompa.
 */
export async function mlFetch<T = unknown>(
  tenantId: string,
  path: string,
  init?: RequestInit & { cuenta?: CuentaMl },
  antesDeLeer?: (texto: string) => string
): Promise<T> {
  // `cuenta`: con qué cuenta de ML (docs/sdd/010); sin cuenta, la principal.
  const { cuenta: cuentaId, ...pedido } = init ?? {};
  const doFetch = async (token: string) => {
    return fetch(`${ML_API}${path}`, {
      ...pedido,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(pedido.headers || {}),
      },
    });
  };

  let token = await getValidAccessToken(tenantId, cuentaId);
  let res = await doFetch(token);

  if (res.status === 401) {
    // Forzar refresh aunque la DB creyera que el token era válido
    const cuenta = await filaDeCuenta(tenantId, cuentaId);
    if (cuenta) {
      token = await refrescar(cuenta);
      res = await doFetch(token);
    }
  }

  const texto = await res.text().catch(() => "");
  let json: unknown = null;
  try {
    json = texto ? JSON.parse(antesDeLeer ? antesDeLeer(texto) : texto) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    throw new Error(
      `ML API ${res.status} en ${path}: ${json ? JSON.stringify(json).slice(0, 300) : "sin cuerpo"}`
    );
  }
  return json as T;
}

/* ───────────────────────── Tipos de ML (parciales) ───────────────────────── */

export interface MlOrderItem {
  item: {
    id: string;
    title: string;
    seller_sku?: string | null;
    variation_id?: number | null;
    variation_attributes?: Array<{ name: string; value_name: string }>;
  };
  quantity: number;
  unit_price: number;
  sale_fee?: number; // comisión de ML por unidad
}

export interface MlOrder {
  id: number;
  status: string; // paid, confirmed, cancelled, etc.
  date_created: string;
  date_closed?: string | null;
  total_amount: number;
  currency_id: string;
  order_items: MlOrderItem[];
  buyer: {
    id: number;
    nickname?: string;
    first_name?: string;
    last_name?: string;
  };
  payments?: Array<{
    id: number;
    status: string;
    date_approved?: string | null;
    transaction_amount?: number;
    shipping_cost?: number;
  }>;
  shipping?: { id?: number | null };
  tags?: string[];
  pack_id?: number | null;
  /** Lo que ML terminó pagándole al vendedor. En una cancelación queda en 0. */
  paid_amount?: number;
  /** Sólo viene si la orden está cancelada: quién la canceló y por qué. */
  cancel_detail?: {
    group?: string;
    code?: string;
    description?: string;
    requested_by?: string;
    date?: string;
  } | null;
}

export interface MlPayment {
  id: number;
  status: string;
  order_id?: number | string;
  money_release_date?: string | null;
  date_approved?: string | null;
  transaction_amount?: number;
}

export interface MlOrderSearchResult {
  results: MlOrder[];
  paging: { total: number; offset: number; limit: number };
}

/* ───────────────────────── Endpoints concretos ───────────────────────── */

export async function getOrder(tenantId: string, orderId: string | number): Promise<MlOrder> {
  return mlFetch<MlOrder>(tenantId, `/orders/${orderId}`);
}

export async function getPayment(
  tenantId: string,
  paymentId: string | number
): Promise<MlPayment> {
  return mlFetch<MlPayment>(tenantId, `/payments/${paymentId}`);
}

export interface MlPack {
  id: number;
  status?: string;
  orders: Array<{ id: number }>;
}

/** Trae un pack (carrito con varios productos) y los IDs de sus órdenes. */
export async function getPack(tenantId: string, packId: string | number): Promise<MlPack> {
  return mlFetch<MlPack>(tenantId, `/packs/${packId}`);
}

export interface MlShipmentCosts {
  gross_amount?: number;
  senders?: Array<{ cost?: number; user_id?: number }>;
  receiver?: { cost?: number };
}

/**
 * Costos del envío. `senders[].cost` es lo que paga el VENDEDOR por el envío
 * (ya con los descuentos/bonificaciones de Mercado Envíos aplicados).
 */
export async function getShipmentCosts(
  tenantId: string,
  shipmentId: string | number
): Promise<MlShipmentCosts> {
  return mlFetch<MlShipmentCosts>(tenantId, `/shipments/${shipmentId}/costs`);
}

export interface MlShipment {
  id: number;
  status?: string; // pending, shipped, delivered, etc.
  substatus?: string | null;
  logistic_type?: string | null; // "self_service" = Flex
  status_history?: {
    date_delivered?: string | null;
    date_shipped?: string | null;
  };
  shipping_option?: {
    estimated_schedule_limit?: { date?: string | null }; // límite para despachar
    estimated_delivery_time?: { date?: string | null };  // entrega estimada
    estimated_delivery_limit?: { date?: string | null };
    estimated_delivery_final?: { date?: string | null };
  };
}

/** Datos del envío, incluidas las fechas estimadas de despacho y entrega. */
export async function getShipment(
  tenantId: string,
  shipmentId: string | number
): Promise<MlShipment> {
  return mlFetch<MlShipment>(tenantId, `/shipments/${shipmentId}`);
}

/** Busca órdenes del vendedor en un rango de fechas (paginado). */
export async function searchOrders(
  tenantId: string,
  opts: { sellerId: string; from?: string; to?: string; offset?: number; limit?: number }
): Promise<MlOrderSearchResult> {
  const params = new URLSearchParams({
    seller: opts.sellerId,
    sort: "date_desc",
    offset: String(opts.offset ?? 0),
    limit: String(opts.limit ?? 50),
  });
  if (opts.from) params.set("order.date_created.from", opts.from);
  if (opts.to) params.set("order.date_created.to", opts.to);
  return mlFetch<MlOrderSearchResult>(tenantId, `/orders/search?${params.toString()}`);
}

/** Datos de la cuenta autenticada (para mostrar nickname al conectar). */
export async function getMe(tenantId: string, cuenta?: CuentaMl): Promise<{ id: number; nickname: string }> {
  return mlFetch(tenantId, `/users/me`, { cuenta });
}
