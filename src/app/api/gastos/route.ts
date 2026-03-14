import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mes = searchParams.get("mes");
  const anio = searchParams.get("anio");

  let where = {};
  if (mes && anio) {
    const inicio = new Date(parseInt(anio), parseInt(mes) - 1, 1);
    const fin = new Date(parseInt(anio), parseInt(mes), 1);
    where = { fecha: { gte: inicio, lt: fin } };
  } else if (anio) {
    const inicio = new Date(parseInt(anio), 0, 1);
    const fin = new Date(parseInt(anio) + 1, 0, 1);
    where = { fecha: { gte: inicio, lt: fin } };
  }

  const gastos = await prisma.gasto.findMany({
    where,
    orderBy: { fecha: "desc" },
  });
  return NextResponse.json(gastos);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const gasto = await prisma.gasto.create({
    data: {
      fecha: body.fecha ? new Date(body.fecha) : new Date(),
      categoria: body.categoria,
      monto: parseFloat(body.monto),
      descripcion: body.descripcion || null,
    },
  });
  return NextResponse.json(gasto, { status: 201 });
}
