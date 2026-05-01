export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/integraciones/pedidos-revision/[id]/resolver
 *
 * Marca un pedido como "ya revisado" — quita la etiqueta `revision_manual`.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const { id } = await params;

    const pedido = await prisma.pedido.findFirst({
      where: { id, tenantId },
      select: { id: true, etiquetas: true },
    });
    if (!pedido) {
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
    }

    const nuevasEtiquetas = pedido.etiquetas.filter((e) => e !== "revision_manual");
    const actualizado = await prisma.pedido.update({
      where: { id },
      data: { etiquetas: nuevasEtiquetas },
    });

    return NextResponse.json(actualizado);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
