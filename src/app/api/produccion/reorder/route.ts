export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { reasignarReservas } from "@/lib/reservas";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const { orden }: { orden: string[] } = await request.json();

    // orden es un array de pedido IDs en el nuevo orden
    const updates = orden.map((id, index) =>
      prisma.pedido.update({
        where: { id },
        data: { ordenProduccion: index },
      })
    );

    await prisma.$transaction(updates);

    // Cambió el orden de la cola: el stock se reparte de nuevo con ese criterio.
    const reparto = await reasignarReservas(tenantId);

    return NextResponse.json({ ok: true, reparto });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
