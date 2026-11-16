export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { responder } from "@/lib/api-envoltura";
import { archivosDePiezas } from "@/lib/archivos-de-piezas";

/**
 * GET /api/piezas/archivos?ids=a,b,c → el archivo de cada pieza de Bodega pedida, con su placa y
 * miniaturas firmadas. Las piezas sin archivo no vienen. (docs/sdd/014, spec 001)
 */
export async function GET(request: NextRequest) {
  return responder(async () => {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const ids = (request.nextUrl.searchParams.get("ids") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 300);
    return { archivos: await archivosDePiezas(tenantId, ids) };
  });
}
