export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { malPedido, responder } from "@/lib/api-envoltura";
import { engancharPieza } from "@/lib/archivos-de-piezas";

/**
 * PUT /api/piezas/:id/archivo { archivoId: string | null, placa?: number | null }
 *   → engancha la pieza de Bodega a un archivo de la biblioteca (y una placa), o la suelta.
 *   Soltar no borra el archivo. (docs/sdd/014, spec 001)
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return responder(async () => {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const archivoId = typeof body?.archivoId === "string" && body.archivoId ? body.archivoId : null;
    const placa = body?.placa == null ? null : Math.round(Number(body.placa));
    if (placa != null && (!Number.isFinite(placa) || placa < 1)) return malPedido("Placa inválida");
    const r = await engancharPieza(tenantId, id, archivoId, placa);
    return "error" in r ? malPedido(r.error!) : r;
  });
}
