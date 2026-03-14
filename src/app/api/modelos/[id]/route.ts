export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const { id } = await params;
    const body = await request.json();
    const modelo = await prisma.modelo.update({
      where: { id, tenantId },
      data: {
        productoId: body.productoId,
        nombre: body.nombre,
        serie: body.serie || null,
        pesoGr: body.pesoGr ? parseFloat(body.pesoGr) : null,
        notas: body.notas || null,
        archivo3mfUrl: body.archivo3mfUrl || null,
        imagenUrl: body.imagenUrl || null,
      },
    });
    return NextResponse.json(modelo);
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
    await prisma.modelo.delete({ where: { id, tenantId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
