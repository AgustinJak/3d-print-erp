export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const { id } = await params;
    const modelo = await prisma.modelo.findUnique({
      where: { id, tenantId },
      include: {
        categorias: { include: { categoria: true } },
      },
    });
    if (!modelo) {
      return NextResponse.json({ error: "Modelo no encontrado" }, { status: 404 });
    }
    return NextResponse.json(modelo);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const { id } = await params;
    const body = await request.json();

    const categoriaIds: string[] | undefined = body.categoriaIds;

    const modelo = await prisma.$transaction(async (tx) => {
      // If categoriaIds provided, delete old join records and recreate
      if (categoriaIds !== undefined) {
        await tx.categoriaModelo.deleteMany({ where: { modeloId: id } });
        if (categoriaIds.length > 0) {
          await tx.categoriaModelo.createMany({
            data: categoriaIds.map((catId: string) => ({
              modeloId: id,
              categoriaId: catId,
            })),
          });
        }
      }

      return tx.modelo.update({
        where: { id, tenantId },
        data: {
          nombre: body.nombre,
          serie: body.serie || null,
          pesoGr: body.pesoGr ? parseFloat(body.pesoGr) : null,
          costoFab: body.costoFab != null ? parseFloat(body.costoFab) : undefined,
          precioVenta: body.precioVenta != null ? parseFloat(body.precioVenta) : undefined,
          precioCreditoPorc: body.precioCreditoPorc != null ? parseFloat(body.precioCreditoPorc) : undefined,
          precioMayorista: body.precioMayorista !== undefined ? (body.precioMayorista ? parseFloat(body.precioMayorista) : null) : undefined,
          precioPromo: body.precioPromo !== undefined ? (body.precioPromo ? parseFloat(body.precioPromo) : null) : undefined,
          notas: body.notas || null,
          archivo3mfUrl: body.archivo3mfUrl || null,
          imagenUrl: body.imagenUrl || null,
          imagenesUrls: body.imagenesUrls !== undefined ? body.imagenesUrls : undefined,
          activo: body.activo !== undefined ? body.activo : undefined,
        },
        include: {
          categorias: { include: { categoria: true } },
        },
      });
    });

    return NextResponse.json(modelo);
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
    await prisma.modelo.delete({ where: { id, tenantId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
