export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { malPedido, responder } from "@/lib/api-envoltura";
import { crearTarea, historial, tablero } from "@/lib/tareas";
import { diaDe } from "@/lib/tareas-reglas";

/**
 * GET  /api/tareas                       → el tablero de hoy (crea las que se repiten y tocan hoy).
 * GET  /api/tareas?vista=historial&desde=YYYY-MM-DD&hasta=YYYY-MM-DD → lo terminado, por día.
 * POST /api/tareas { titulo, estado?, ... } → crea una tarea.
 * (docs/sdd/012)
 */
const esDia = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export async function GET(request: NextRequest) {
  return responder(async () => {
    const { tenantId } = await getAuthenticatedTenant();
    const p = new URL(request.url).searchParams;
    if (p.get("vista") === "historial") {
      const hasta = esDia(p.get("hasta")) ? p.get("hasta")! : diaDe(new Date());
      const desde = esDia(p.get("desde")) ? p.get("desde")! : diaDe(new Date(Date.now() - 30 * 864e5));
      return historial(tenantId, desde, hasta);
    }
    return tablero(tenantId);
  });
}

export async function POST(request: NextRequest) {
  return responder(async () => {
    const { tenantId, user } = await getAuthenticatedTenant();
    const body = await request.json();
    if (!body?.titulo?.trim()) return malPedido("Falta el título");
    return crearTarea(tenantId, user.id, body);
  });
}
