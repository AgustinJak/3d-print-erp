import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const cliente = await prisma.cliente.update({
    where: { id },
    data: {
      nombre: body.nombre,
      telefono: body.telefono || null,
      email: body.email || null,
      direccion: body.direccion || null,
      notas: body.notas || null,
    },
  });
  return NextResponse.json(cliente);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.cliente.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
