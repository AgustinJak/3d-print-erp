import { updateSession } from "@/lib/supabase/middleware";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Webhooks públicos firmados con HMAC: bypass total del auth middleware.
  // La autenticación la hace el verificador HMAC dentro del propio endpoint.
  if (pathname.startsWith("/api/webhook/")) {
    return NextResponse.next();
  }

  // Webhook de Mercado Libre: ML no envía cookies de sesión. La validación
  // se hace dentro del endpoint (application_id + consulta a la API de ML).
  if (pathname.startsWith("/api/webhooks/mercadolibre")) {
    return NextResponse.next();
  }

  // Cron de sincronización: no hay usuario logueado detrás. Se autentica solo,
  // con CRON_SECRET, dentro del endpoint.
  if (pathname.startsWith("/api/cron/")) {
    return NextResponse.next();
  }

  // La Bodega (app de escritorio, docs/sdd/017) no tiene cookies: manda el token de su sesión de
  // Supabase en Authorization: Bearer, y lo valida el endpoint con getTenantDeBodega(). Sólo estas
  // rutas, no todo /api/bodega/ (altas y piezas siguen con cookie).
  if (pathname === "/api/bodega/envios" || pathname === "/api/bodega/etiquetas") {
    return NextResponse.next();
  }

  // El link del repartidor (docs/sdd/018): no tiene usuario. La llave es el token del link, que
  // validan la página y su API (lib/reparto.ts). Sólo /r/<token> y /api/r/<token>.
  if (/^\/(api\/)?r\/[A-Za-z0-9_-]+(\/[A-Za-z0-9-]+)?$/.test(pathname)) {
    return NextResponse.next();
  }

  // Callback de OAuth de Mercado Libre: ML redirige al usuario sin garantía de
  // cookies. La identidad del tenant se valida con el `state` firmado (HMAC).
  if (pathname.startsWith("/api/ml/oauth/callback")) {
    return NextResponse.next();
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    // Excluye recursos estáticos y rutas de webhook (firmadas con HMAC).
    "/((?!_next/static|_next/image|favicon.ico|api/webhook/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
