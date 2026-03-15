export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const { id } = await params;
    const categoria = await prisma.categoria.findUnique({
      where: { id, tenantId },
      include: {
        _count: { select: { modelos: true } },
        modelos: {
          include: {
            modelo: {
              select: {
                id: true,
                nombre: true,
                imagenUrl: true,
                precioVenta: true,
              },
            },
          },
        },
      },
    });
    if (!categoria) {
      return NextResponse.json(
        { error: "Categoría no encontrada" },
        { status: 404 }
      );
    }
    return NextResponse.json(categoria);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const { id } = await params;
    const body = await request.json();
    const categoria = await prisma.categoria.update({
      where: { id, tenantId },
      data: {
        nombre: body.nombre,
        descripcion: body.descripcion || null,
        color: body.color || null,
        activo: body.activo,
      },
    });
    return NextResponse.json(categoria);
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
    await prisma.categoria.delete({ where: { id, tenantId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
