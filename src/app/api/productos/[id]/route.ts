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
    const producto = await prisma.producto.findFirst({
      where: { id, tenantId },
      include: { modelos: true },
    });
    if (!producto) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    return NextResponse.json(producto);
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
    const producto = await prisma.producto.update({
      where: { id, tenantId },
      data: {
        nombre: body.nombre,
        tamanioCm: body.tamanioCm ? parseFloat(body.tamanioCm) : null,
        pesoPromedioGr: body.pesoPromedioGr ? parseFloat(body.pesoPromedioGr) : null,
        costoBaseFab: parseFloat(body.costoBaseFab),
        precioBaseVenta: parseFloat(body.precioBaseVenta),
        precioCreditoPorc: body.precioCreditoPorc ? parseFloat(body.precioCreditoPorc) : 10,
        reglasDescuento: body.reglasDescuento || null,
        notas: body.notas || null,
        activo: body.activo ?? true,
      },
    });
    return NextResponse.json(producto);
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
    await prisma.producto.delete({ where: { id, tenantId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
