export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { noEncontrado, responder } from "@/lib/api-envoltura";
import { borrarTarea, cambiarTarea } from "@/lib/tareas";

/** PATCH /api/tareas/:id → cambia la tarea (estado, orden, campos, archivos). DELETE → la borra. (docs/sdd/012) */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return responder(async () => {
    const { tenantId } = await getAuthenticatedTenant();
    const { id } = await params;
    return (await cambiarTarea(tenantId, id, await request.json())) ?? noEncontrado();
  });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return responder(async () => {
    const { tenantId } = await getAuthenticatedTenant();
    const { id } = await params;
    return (await borrarTarea(tenantId, id)) ? { ok: true } : noEncontrado();
  });
}
