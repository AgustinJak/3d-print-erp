import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const productoId = searchParams.get("productoId");

  const modelos = await prisma.modelo.findMany({
    where: productoId ? { productoId } : undefined,
    orderBy: { creadoEn: "desc" },
    include: { producto: { select: { id: true, nombre: true } } },
  });
  return NextResponse.json(modelos);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const modelo = await prisma.modelo.create({
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
  return NextResponse.json(modelo, { status: 201 });
}
