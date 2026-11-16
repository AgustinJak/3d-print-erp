export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { malPedido, responder } from "@/lib/api-envoltura";
import { archivos, prepararSubida } from "@/lib/tareas";

/**
 * GET  /api/archivos → la biblioteca 3D (con miniaturas firmadas).
 * POST /api/archivos { nombre, tamano, carpeta? } → prepara una subida: devuelve el id y el token
 *      firmado para que el navegador suba directo al bucket privado. Después, POST
 *      /api/archivos/:id { accion: "confirmar" }. (docs/sdd/012)
 */
export async function GET() {
  return responder(async () => {
    const { tenantId } = await getAuthenticatedTenant();
    return { archivos: await archivos(tenantId) };
  });
}

export async function POST(request: NextRequest) {
  return responder(async () => {
    const { tenantId, user } = await getAuthenticatedTenant();
    const body = await request.json();
    if (!body?.nombre?.trim()) return malPedido("Falta el nombre");
    return prepararSubida(tenantId, user.id, body);
  });
}
