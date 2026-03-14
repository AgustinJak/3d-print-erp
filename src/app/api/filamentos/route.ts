export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const filamentos = await prisma.filamento.findMany({
    orderBy: { creadoEn: "desc" },
  });
  return NextResponse.json(filamentos);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const filamento = await prisma.filamento.create({
    data: {
      marca: body.marca,
      tipoMaterial: body.tipoMaterial,
      color: body.color,
      tempExtrusor: body.tempExtrusor ? parseInt(body.tempExtrusor) : null,
      tempCama: body.tempCama ? parseInt(body.tempCama) : null,
      velocidadRec: body.velocidadRec ? parseInt(body.velocidadRec) : null,
      pesoCarreteGr: body.pesoCarreteGr ? parseFloat(body.pesoCarreteGr) : null,
      pesoRestanteGr: body.pesoRestanteGr ? parseFloat(body.pesoRestanteGr) : null,
      costoPorGr: body.costoPorGr ? parseFloat(body.costoPorGr) : null,
      notas: body.notas || null,
    },
  });
  return NextResponse.json(filamento, { status: 201 });
}
