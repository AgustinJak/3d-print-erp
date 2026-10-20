export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { ErrorDeMapeo, mapearClave, type CambiosDeMapeo } from "@/lib/mapeo-canal";
import { reasignarReservas } from "@/lib/reservas";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

/**
 * Mapea una clave a mano (docs/sdd/001, spec 004, REQ-4 y REQ-5).
 *
 * `{ combinacionId?, unidades?, ignorar? }`. Desde acá el mapeo queda `manual`:
 * la resolución automática no lo vuelve a tocar. Si queda apuntando a una
 * combinación, las líneas de pedidos abiertos que entraron con esta clave y sin
 * combinación la toman, con su costo y sus unidades, y se reparte el stock.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const { id } = await params;
    const body: CambiosDeMapeo = await request.json();

    const { mapeo, lineasCompletadas } = await mapearClave(prisma, tenantId, id, body);
    if (lineasCompletadas > 0) await reasignarReservas(tenantId);

    return NextResponse.json({
      ok: true,
      lineasCompletadas,
      mapeo: {
        id: mapeo.id,
        combinacion: mapeo.combinacion
          ? { id: mapeo.combinacion.id, nombre: mapeo.combinacion.nombre, sku: mapeo.combinacion.sku, activo: mapeo.combinacion.activo }
          : null,
        unidades: mapeo.unidades,
        ignorar: mapeo.ignorar,
        origen: mapeo.origen,
      },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    if (e instanceof ErrorDeMapeo) return NextResponse.json({ error: e.message }, { status: e.status });
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
