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
