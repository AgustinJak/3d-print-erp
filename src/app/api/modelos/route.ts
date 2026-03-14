export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const { searchParams } = new URL(request.url);
    const productoId = searchParams.get("productoId");

    const modelos = await prisma.modelo.findMany({
      where: productoId ? { productoId, tenantId } : { tenantId },
      orderBy: { creadoEn: "desc" },
      include: { producto: { select: { id: true, nombre: true } } },
    });
    return NextResponse.json(modelos);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
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
        tenantId,
      },
    });
    return NextResponse.json(modelo, { status: 201 });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
