export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { responder } from "@/lib/api-envoltura";
import { archivosDePiezas } from "@/lib/archivos-de-piezas";
import { materialesDeBodega, recetasDePiezas } from "@/lib/recetas-de-piezas";

/**
 * GET /api/piezas?ids=a,b,c → de cada pieza de Bodega pedida, su archivo (con la placa y las
 * miniaturas firmadas) y su receta, más los materiales para elegir (docs/sdd/014).
 */
export async function GET(request: NextRequest) {
  return responder(async () => {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const ids = (request.nextUrl.searchParams.get("ids") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 300);
    const [archivos, recetas, materiales] = await Promise.all([archivosDePiezas(tenantId, ids), recetasDePiezas(tenantId, ids), materialesDeBodega()]);
    return { archivos, recetas, materiales };
  });
}
