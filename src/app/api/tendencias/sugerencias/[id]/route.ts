export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const { id } = await params;
    const body = await request.json();

    // Verify sugerencia belongs to an evento of this tenant
    const sugerencia = await prisma.sugerenciaProducto.findFirst({
      where: { id },
      include: { evento: { select: { tenantId: true } } },
    });

    if (!sugerencia || sugerencia.evento.tenantId !== tenantId) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }

    const updated = await prisma.sugerenciaProducto.update({
      where: { id },
      data: {
        modeloVinculadoId: body.modeloVinculadoId ?? null,
      },
      include: {
        modeloVinculado: {
          select: { id: true, nombre: true, imagenUrl: true },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
