export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const { id } = await params;
    const body = await request.json();
    const filamento = await prisma.filamento.update({
      where: { id, tenantId },
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
    return NextResponse.json(filamento);
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
    await prisma.filamento.delete({ where: { id, tenantId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
