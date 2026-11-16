export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { noEncontrado, responder } from "@/lib/api-envoltura";
import { borrarRecurrente, cambiarRecurrente } from "@/lib/tareas";

/** PATCH /api/tareas/recurrentes/:id → la cambia (o la pausa). DELETE → la borra. (docs/sdd/012) */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return responder(async () => {
    const { tenantId } = await getAuthenticatedTenant();
    const { id } = await params;
    return (await cambiarRecurrente(tenantId, id, await request.json())) ? { ok: true } : noEncontrado();
  });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return responder(async () => {
    const { tenantId } = await getAuthenticatedTenant();
    const { id } = await params;
    return (await borrarRecurrente(tenantId, id)) ? { ok: true } : noEncontrado();
  });
}
