export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const { searchParams } = new URL(request.url);
    const activoParam = searchParams.get("activo");

    const where: { tenantId: string; activo?: boolean } = { tenantId };
    if (activoParam !== null) {
      where.activo = activoParam === "true";
    }

    const categorias = await prisma.categoria.findMany({
      where,
      orderBy: { creadoEn: "desc" },
      include: {
        _count: { select: { modelos: true } },
        modelos: {
          take: 4,
          include: {
            modelo: {
              select: { imagenUrl: true },
            },
          },
        },
      },
    });

    const result = categorias.map((cat) => ({
      ...cat,
      modeloImagenes: cat.modelos.map((cm) => cm.modelo.imagenUrl).filter(Boolean),
      modelos: undefined,
    }));

    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const body = await request.json();
    const categoria = await prisma.categoria.create({
      data: {
        nombre: body.nombre,
        descripcion: body.descripcion || null,
        color: body.color || null,
        activo: body.activo ?? true,
        tenantId,
      },
    });
    return NextResponse.json(categoria, { status: 201 });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
