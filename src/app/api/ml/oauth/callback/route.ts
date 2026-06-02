export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  exchangeCodeForTokens,
  saveTokens,
  parseOAuthState,
  getMe,
} from "@/lib/mercadolibre";

/**
 * Callback de OAuth de Mercado Libre.
 *
 * ML redirige acá con ?code=...&state=... tras la autorización.
 * - Validamos el `state` firmado (identifica el tenant + previene CSRF)
 * - Intercambiamos el code por tokens
 * - Guardamos la cuenta
 * - Redirigimos a la sección Integraciones con un flag de resultado
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const errorParam = searchParams.get("error");

  const redirectTo = (status: string, detail?: string) => {
    const url = new URL("/integraciones", request.url);
    url.searchParams.set("tab", "mercadolibre");
    url.searchParams.set("ml", status);
    if (detail) url.searchParams.set("detail", detail.slice(0, 120));
    return NextResponse.redirect(url);
  };

  if (errorParam) {
    return redirectTo("error", `ml_denied: ${errorParam}`);
  }
  if (!code || !state) {
    return redirectTo("error", "missing_code_or_state");
  }

  const parsed = parseOAuthState(state);
  if (!parsed) {
    return redirectTo("error", "invalid_state");
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    // Guardamos primero para poder usar el token al consultar el nickname
    await saveTokens(parsed.tenantId, tokens);
    try {
      const me = await getMe(parsed.tenantId);
      await saveTokens(parsed.tenantId, tokens, me.nickname);
    } catch {
      // Si falla traer el nickname, no es crítico
    }
    return redirectTo("ok");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "token_exchange_failed";
    return redirectTo("error", msg);
  }
}
