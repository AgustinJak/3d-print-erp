export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { malPedido, responder } from "@/lib/api-envoltura";
import { crearRecurrente, recurrentes } from "@/lib/tareas";

/** GET /api/tareas/recurrentes → las que se repiten. POST → crea una. (docs/sdd/012) */
export async function GET() {
  return responder(async () => {
    const { tenantId } = await getAuthenticatedTenant();
    return { recurrentes: await recurrentes(tenantId) };
  });
}

export async function POST(request: NextRequest) {
  return responder(async () => {
    const { tenantId } = await getAuthenticatedTenant();
    const body = await request.json();
    if (!body?.titulo?.trim()) return malPedido("Falta el título");
    if (!["diaria", "semanal", "mensual"].includes(body?.frecuencia)) return malPedido("Frecuencia inválida");
    return crearRecurrente(tenantId, body);
  });
}
