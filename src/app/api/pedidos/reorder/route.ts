export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(request: NextRequest) {
  try {
    await getAuthenticatedTenant();
    const { orden }: { orden: string[] } = await request.json();

    const updates = orden.map((id, index) =>
      prisma.pedido.update({
        where: { id },
        data: { ordenProduccion: index },
      })
    );

    await prisma.$transaction(updates);

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
