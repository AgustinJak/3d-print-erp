export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { malPedido, noEncontrado, responder } from "@/lib/api-envoltura";
import { borrarArchivo, cambiarArchivo, confirmarSubida, prepararMiniatura } from "@/lib/tareas";
import { guardarLectura } from "@/lib/archivos-de-piezas";

/**
 * POST   /api/archivos/:id { accion: "confirmar" }  → la subida terminó.
 * POST   /api/archivos/:id { accion: "miniatura" }  → token para subir la miniatura del visor.
 * POST   /api/archivos/:id { accion: "lectura", placas, hash?, conMiniatura } → guarda lo leído del
 *        3MF y da los tokens para las miniaturas de las placas (docs/sdd/014).
 * PATCH  /api/archivos/:id { nombre?, carpeta?, etiquetas? }
 * DELETE /api/archivos/:id → lo borra del almacenamiento. (docs/sdd/012)
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return responder(async () => {
    const { tenantId } = await getAuthenticatedTenant();
    const { id } = await params;
    const body = await request.json();
    const { accion } = body ?? {};
    if (accion === "confirmar") return (await confirmarSubida(tenantId, id)) ? { ok: true } : noEncontrado();
    if (accion === "miniatura") return (await prepararMiniatura(tenantId, id)) ?? noEncontrado();
    // docs/sdd/014: lo que el navegador leyó del 3MF (placas, gramos, tiempo, sha256) y los tokens
    // para subir sus miniaturas.
    if (accion === "lectura") {
      if (!Array.isArray(body.placas)) return malPedido("Faltan las placas");
      return (await guardarLectura(tenantId, id, { hash: body.hash ?? null, placas: body.placas, conMiniatura: !!body.conMiniatura })) ?? noEncontrado();
    }
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
