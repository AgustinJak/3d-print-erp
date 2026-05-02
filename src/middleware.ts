import { updateSession } from "@/lib/supabase/middleware";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // Webhooks públicos firmados con HMAC: bypass total del auth middleware.
  // La autenticación la hace el verificador HMAC dentro del propio endpoint.
  if (request.nextUrl.pathname.startsWith("/api/webhook/")) {
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
