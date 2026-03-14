import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const gasto = await prisma.gasto.update({
    where: { id },
    data: {
      fecha: body.fecha ? new Date(body.fecha) : undefined,
      categoria: body.categoria,
      monto: parseFloat(body.monto),
      descripcion: body.descripcion || null,
    },
  });
  return NextResponse.json(gasto);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.gasto.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
