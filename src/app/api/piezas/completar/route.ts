export const dynamic = "force-dynamic";

import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { responder } from "@/lib/api-envoltura";
import { piezasACompletar } from "@/lib/piezas-a-completar";

/**
 * GET /api/piezas/completar → las piezas de los productos activos y los insumos, con lo que les
 * falta (archivo, receta) y lo vendido en 90 días, de lo más vendido a lo menos (docs/sdd/014).
 */
export async function GET() {
  return responder(async () => {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    return { piezas: await piezasACompletar(tenantId) };
  });
}
