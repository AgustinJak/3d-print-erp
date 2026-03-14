export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const productos = await prisma.producto.findMany({
      where: { tenantId },
      orderBy: { creadoEn: "desc" },
      include: { _count: { select: { modelos: true } } },
    });
    return NextResponse.json(productos);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const body = await request.json();
    const producto = await prisma.producto.create({
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
        tenantId,
      },
    });
    return NextResponse.json(producto, { status: 201 });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
