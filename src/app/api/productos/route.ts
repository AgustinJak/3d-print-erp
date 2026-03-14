import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const productos = await prisma.producto.findMany({
    orderBy: { creadoEn: "desc" },
    include: { _count: { select: { modelos: true } } },
  });
  return NextResponse.json(productos);
}

export async function POST(request: NextRequest) {
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
    },
  });
  return NextResponse.json(producto, { status: 201 });
}
