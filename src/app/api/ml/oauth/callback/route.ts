export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, guardarCuentaConectada, parseOAuthState, usuarioDelToken } from "@/lib/mercadolibre";

/**
 * Callback de OAuth de Mercado Libre.
 *
 * ML redirige acá con ?code=...&state=... tras la autorización.
 * - Validamos el `state` firmado (identifica el tenant + previene CSRF)
 * - Intercambiamos el code por tokens
 * - Guardamos la cuenta: la principal, u otra más si el state lo pide (docs/sdd/010)
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
    // El nickname con el token nuevo, no con el de la principal. Si falla, no es crítico.
    const yo = await usuarioDelToken(tokens.access_token).catch(() => null);
    const r = await guardarCuentaConectada(parsed.tenantId, tokens, yo?.nickname ?? null, parsed.modo);
    // Para conectar otra cuenta hay que entrar a ML con esa: si ML tenía abierta la principal, vuelve
    // la principal y no se crea nada.
    if (parsed.modo === "otra" && !r.nueva && r.principal) {
      return redirectTo("error", "ML devolvió la cuenta principal: cerrá la sesión de Mercado Libre y entrá con la otra cuenta");
    }
    return redirectTo(parsed.modo === "otra" ? "ok_otra" : "ok");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "token_exchange_failed";
    return redirectTo("error", msg);
  }
}
