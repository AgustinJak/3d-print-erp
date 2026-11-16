export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { malPedido, noEncontrado, responder } from "@/lib/api-envoltura";
import { borrarArchivo, cambiarArchivo, confirmarSubida, prepararMiniatura } from "@/lib/tareas";

/**
 * POST   /api/archivos/:id { accion: "confirmar" }  → la subida terminó.
 * POST   /api/archivos/:id { accion: "miniatura" }  → token para subir la miniatura del visor.
 * PATCH  /api/archivos/:id { nombre?, carpeta?, etiquetas? }
 * DELETE /api/archivos/:id → lo borra del almacenamiento. (docs/sdd/012)
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return responder(async () => {
    const { tenantId } = await getAuthenticatedTenant();
    const { id } = await params;
    const { accion } = await request.json();
    if (accion === "confirmar") return (await confirmarSubida(tenantId, id)) ? { ok: true } : noEncontrado();
    if (accion === "miniatura") return (await prepararMiniatura(tenantId, id)) ?? noEncontrado();
    return malPedido("Acción inválida");
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return responder(async () => {
    const { tenantId } = await getAuthenticatedTenant();
    const { id } = await params;
    return (await cambiarArchivo(tenantId, id, await request.json())) ? { ok: true } : noEncontrado();
  });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return responder(async () => {
    const { tenantId } = await getAuthenticatedTenant();
    const { id } = await params;
    return (await borrarArchivo(tenantId, id)) ? { ok: true } : noEncontrado();
  });
}
