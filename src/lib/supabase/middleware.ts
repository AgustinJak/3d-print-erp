import { createServerClient } from "@supabase/ssr";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Cuánto se espera a Supabase para verificar la sesión.
 *
 * Sin límite, el 2026-10-16 —con la base colgada— cada página quedaba esperando hasta que
 * Vercel la cortaba con `504 MIDDLEWARE_INVOCATION_TIMEOUT`, un error que no dice nada. Con el
 * límite, en 5 s se sabe y se muestra qué pasa. Ver el SDD de Bodega
 * `docs/sdd/001-calculadora-y-sincronizacion`, spec 006.
 */
const LIMITE_MS = 5_000;

/** El fetch de Supabase, cortado a los `LIMITE_MS`. Respeta la señal que traiga el pedido. */
const fetchConLimite: typeof fetch = (input, init) => {
  const limite = AbortSignal.timeout(LIMITE_MS);
  const signal =
    init?.signal && typeof AbortSignal.any === "function" ? AbortSignal.any([init.signal, limite]) : limite;
  return fetch(input, { ...init, signal });
};

/** Corta una promesa que no termina, por si algo de Auth espera fuera de un fetch. */
function conLimite<T>(promesa: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("verificación de sesión sin respuesta")), ms);
    promesa.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

/**
 * La respuesta cuando no se pudo verificar la sesión porque Supabase no contestó.
 *
 * Falla **cerrado**: nunca deja pasar un pedido sin sesión verificada. Las APIs reciben JSON
 * (las pantallas lo tratan como un error más y espacian sus consultas); las páginas, una página
 * mínima que no depende de nada —ni de la base, ni de la app—, para que se pueda mostrar
 * justamente cuando nada más anda.
 */
function respuestaSinVerificar(request: NextRequest): NextResponse {
  const cabeceras = { "Retry-After": "30", "Cache-Control": "no-store" };
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "base de datos no responde" }, { status: 503, headers: cabeceras });
  }
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Inventario · sin conexión con la base</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
       font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#0f1729;color:#e8e6f0}
  main{max-width:440px;padding:24px}
  h1{font-size:20px;margin:0 0 8px}
  p{color:#b8b3d1;line-height:1.5;margin:0 0 16px}
  button{font:inherit;padding:10px 16px;border-radius:10px;border:0;background:#d4a853;color:#0f1729;font-weight:600;cursor:pointer}
</style></head>
<body><main>
  <h1>La base de datos no responde</h1>
  <p>El inventario no pudo verificar tu sesión porque Supabase no contestó a tiempo.
     No se perdió nada: las ventas que entren mientras tanto se recuperan cuando vuelva.</p>
  <button onclick="location.reload()">Reintentar</button>
</main></body></html>`;
  return new NextResponse(html, {
    status: 503,
    headers: { ...cabeceras, "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
      global: { fetch: fetchConLimite },
    }
  );

  // Sin sesión en las cookies, getUser responde sin ir a la red (AuthSessionMissingError) y se
  // va a /login como siempre. Sólo un error de red o un 5xx de Auth —lo que pasa cuando Supabase
  // no contesta— lleva al 503.
  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"] = null;
  try {
    const { data, error } = await conLimite(supabase.auth.getUser(), LIMITE_MS + 500);
    user = data.user;
    if (!user && error && isAuthRetryableFetchError(error)) {
      return respuestaSinVerificar(request);
    }
  } catch {
    return respuestaSinVerificar(request);
  }

  // Si no hay usuario y no está en /login, redirigir a login
  if (
    !user &&
    !request.nextUrl.pathname.startsWith("/login")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Si hay usuario y está en /login, redirigir al dashboard
  if (user && request.nextUrl.pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
