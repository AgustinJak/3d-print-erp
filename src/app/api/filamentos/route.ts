export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const filamentos = await prisma.filamento.findMany({
      where: { tenantId },
      orderBy: { creadoEn: "desc" },
    });
    return NextResponse.json(filamentos);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
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
        tenantId,
      },
    });
    return NextResponse.json(filamento, { status: 201 });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
