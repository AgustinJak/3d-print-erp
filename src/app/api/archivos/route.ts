export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { malPedido, responder } from "@/lib/api-envoltura";
import { archivos, prepararSubida } from "@/lib/tareas";
import { archivoConHash } from "@/lib/archivos-de-piezas";

/**
 * GET  /api/archivos → la biblioteca 3D (con miniaturas firmadas).
 * POST /api/archivos { nombre, tamano, carpeta?, hash? } → prepara una subida: devuelve el id y el token
 *      (o { existente } si ya hay un archivo con ese sha256, docs/sdd/014)
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
    // docs/sdd/014: si ya hay uno con el mismo contenido, no se sube de nuevo.
    if (typeof body.hash === "string") {
      const existente = await archivoConHash(tenantId, body.hash);
      if (existente) return { existente: existente.id };
    }
    return prepararSubida(tenantId, user.id, body);
  });
}
