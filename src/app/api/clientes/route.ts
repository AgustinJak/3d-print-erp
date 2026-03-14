export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const clientes = await prisma.cliente.findMany({
    orderBy: { creadoEn: "desc" },
  });
  return NextResponse.json(clientes);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const cliente = await prisma.cliente.create({
    data: {
      nombre: body.nombre,
      telefono: body.telefono || null,
      email: body.email || null,
      direccion: body.direccion || null,
      notas: body.notas || null,
    },
  });
  return NextResponse.json(cliente, { status: 201 });
}
