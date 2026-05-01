export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/modelos/[id]/consolidar
 *
 * Marca este modelo como consolidado en otro modelo destino.
 * - El modelo NO se elimina (los pedidos viejos siguen funcionando)
 * - El modelo queda oculto del catálogo activo y de selectores
 * - Body: { destinoId: string }
 *
 * DELETE /api/modelos/[id]/consolidar
 *
 * Revierte la consolidación (vuelve a aparecer en el catálogo).
 */

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const { id } = await params;
    const body = await request.json();
    const destinoId = body?.destinoId;

    if (!destinoId || typeof destinoId !== "string") {
      return NextResponse.json({ error: "destinoId requerido" }, { status: 400 });
    }

    if (destinoId === id) {
      return NextResponse.json(
        { error: "Un modelo no puede consolidarse en sí mismo" },
        { status: 400 }
      );
    }

    // Verificar que ambos modelos existan en el mismo tenant
    const [origen, destino] = await Promise.all([
      prisma.modelo.findUnique({ where: { id, tenantId } }),
      prisma.modelo.findUnique({ where: { id: destinoId, tenantId } }),
    ]);

    if (!origen) return NextResponse.json({ error: "Modelo origen no existe" }, { status: 404 });
    if (!destino)
      return NextResponse.json({ error: "Modelo destino no existe" }, { status: 404 });

    // No permitir consolidar en un modelo que ya está consolidado (cadenas)
    if (destino.consolidadoEnId) {
      return NextResponse.json(
        {
          error:
            "El destino ya está consolidado en otro modelo. Elegí un modelo principal.",
        },
        { status: 400 }
      );
    }

    const actualizado = await prisma.modelo.update({
      where: { id, tenantId },
      data: { consolidadoEnId: destinoId, activo: false },
    });

    return NextResponse.json(actualizado);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const { id } = await params;

    const actualizado = await prisma.modelo.update({
      where: { id, tenantId },
      data: { consolidadoEnId: null },
    });

    return NextResponse.json(actualizado);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
