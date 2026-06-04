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

/** Genera un `state` firmado que incluye tenantId + timestamp. */
export function buildOAuthState(tenantId: string): string {
  const payload = `${tenantId}.${Date.now()}`;
  const sig = createHmac("sha256", getStateSecret()).update(payload).digest("hex");
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

/** Valida un `state` firmado. Devuelve el tenantId si es válido (y no expiró). */
export function parseOAuthState(state: string): { tenantId: string } | null {
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
    return { tenantId };
  } catch {
    return null;
  }
}

/** URL a la que redirigir al usuario para que autorice la app. */
export function buildAuthorizationUrl(tenantId: string): string {
  const { clientId, redirectUri } = getMlConfig();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state: buildOAuthState(tenantId),
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

/** Guarda (upsert) los tokens de una cuenta ML para un tenant. */
export async function saveTokens(
  tenantId: string,
  token: MlTokenResponse,
  nickname?: string | null
) {
  const expiresAt = new Date(Date.now() + token.expires_in * 1000);
  return prisma.cuentaMercadolibre.upsert({
    where: { tenantId },
    create: {
      tenantId,
      mlUserId: String(token.user_id),
      nickname: nickname ?? null,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt,
      scope: token.scope,
    },
    update: {
      mlUserId: String(token.user_id),
      ...(nickname !== undefined ? { nickname } : {}),
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt,
      scope: token.scope,
    },
  });
}

/* ───────────────────────── Cliente autenticado ───────────────────────── */

export interface MlAccount {
  tenantId: string;
  mlUserId: string;
  nickname: string | null;
  scope: string | null;
  expiresAt: Date;
}

/** Devuelve la cuenta ML conectada del tenant (o null si no hay). */
export async function getMlAccount(tenantId: string): Promise<MlAccount | null> {
  const cuenta = await prisma.cuentaMercadolibre.findUnique({ where: { tenantId } });
  if (!cuenta) return null;
  return {
    tenantId: cuenta.tenantId,
    mlUserId: cuenta.mlUserId,
    nickname: cuenta.nickname,
    scope: cuenta.scope,
    expiresAt: cuenta.expiresAt,
  };
}

/**
 * Devuelve un access_token válido para el tenant, refrescándolo si está
 * por expirar. Lanza error si el tenant no tiene cuenta conectada.
 */
export async function getValidAccessToken(tenantId: string): Promise<string> {
  const cuenta = await prisma.cuentaMercadolibre.findUnique({ where: { tenantId } });
  if (!cuenta) {
    throw new Error(`No hay cuenta de Mercado Libre conectada para el tenant "${tenantId}"`);
  }

  const expiraEn = cuenta.expiresAt.getTime() - Date.now();
  if (expiraEn > REFRESH_MARGIN_MS) {
    return cuenta.accessToken;
  }

  // Token expirado o por expirar → refrescar
  const nuevo = await refreshTokens(cuenta.refreshToken);
  await saveTokens(tenantId, nuevo);
  return nuevo.access_token;
}

/**
 * Fetch autenticado contra la API de ML. Reintenta una vez ante 401
 * forzando refresh del token.
 */
export async function mlFetch<T = unknown>(
  tenantId: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const doFetch = async (token: string) => {
    return fetch(`${ML_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(init?.headers || {}),
      },
    });
  };

  let token = await getValidAccessToken(tenantId);
  let res = await doFetch(token);

  if (res.status === 401) {
    // Forzar refresh aunque la DB creyera que el token era válido
    const cuenta = await prisma.cuentaMercadolibre.findUnique({ where: { tenantId } });
    if (cuenta) {
      const nuevo = await refreshTokens(cuenta.refreshToken);
      await saveTokens(tenantId, nuevo);
      token = nuevo.access_token;
      res = await doFetch(token);
    }
  }

  const json = await res.json().catch(() => null);
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
export async function getMe(tenantId: string): Promise<{ id: number; nickname: string }> {
  return mlFetch(tenantId, `/users/me`);
}
