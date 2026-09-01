export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { reasignarReservas } from "@/lib/reservas";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const { orden }: { orden: string[] } = await request.json();

    const updates = orden.map((id, index) =>
      prisma.pedido.update({
        where: { id },
        data: { ordenProduccion: index },
      })
    );

    await prisma.$transaction(updates);

    // El orden manual es el primer criterio del reparto: si cambió, el stock
    // puede pasar de un pedido a otro.
    const reparto = await reasignarReservas(tenantId);

    return NextResponse.json({ ok: true, reparto });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
