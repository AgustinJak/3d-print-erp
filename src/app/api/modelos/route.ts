export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const { searchParams } = new URL(request.url);
    const productoId = searchParams.get("productoId");
    const categoriaId = searchParams.get("categoriaId");
    const activoParam = searchParams.get("activo");

    const where: Record<string, unknown> = { tenantId };
    if (productoId) where.productoId = productoId;
    if (categoriaId) {
      where.categorias = { some: { categoriaId } };
    }
    if (activoParam !== null) {
      where.activo = activoParam === "true";
    }

    const modelos = await prisma.modelo.findMany({
      where,
      orderBy: { creadoEn: "desc" },
      include: {
        producto: { select: { id: true, nombre: true } },
        categorias: { include: { categoria: true } },
      },
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

    const categoriaIds: string[] = body.categoriaIds ?? [];

    const modelo = await prisma.modelo.create({
      data: {
        productoId: body.productoId || null,
        nombre: body.nombre,
        serie: body.serie || null,
        pesoGr: body.pesoGr ? parseFloat(body.pesoGr) : null,
        costoFab: body.costoFab ? parseFloat(body.costoFab) : 0,
        precioVenta: body.precioVenta ? parseFloat(body.precioVenta) : 0,
        precioCreditoPorc: body.precioCreditoPorc != null ? parseFloat(body.precioCreditoPorc) : 10,
        precioMayorista: body.precioMayorista ? parseFloat(body.precioMayorista) : null,
        precioPromo: body.precioPromo ? parseFloat(body.precioPromo) : null,
        notas: body.notas || null,
        archivo3mfUrl: body.archivo3mfUrl || null,
        imagenUrl: body.imagenUrl || null,
        imagenesUrls: body.imagenesUrls ?? [],
        activo: body.activo ?? true,
        tenantId,
        categorias: categoriaIds.length > 0
          ? { create: categoriaIds.map((catId: string) => ({ categoriaId: catId })) }
          : undefined,
      },
      include: {
        producto: { select: { id: true, nombre: true } },
        categorias: { include: { categoria: true } },
      },
    });
    return NextResponse.json(modelo, { status: 201 });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
