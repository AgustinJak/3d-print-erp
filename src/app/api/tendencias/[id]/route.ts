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

    const evento = await prisma.eventoTendencia.findFirst({
      where: { id, tenantId },
      include: {
        sugerencias: {
          include: {
            modeloVinculado: {
              select: { id: true, nombre: true, imagenUrl: true },
            },
          },
        },
      },
    });

    if (!evento)
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    return NextResponse.json(evento);
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

    // Verify the evento belongs to this tenant
    const existing = await prisma.eventoTendencia.findFirst({
      where: { id, tenantId },
    });
    if (!existing)
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    const { sugerencias, ...eventoData } = body;

    const evento = await prisma.$transaction(async (tx) => {
      // Delete old sugerencias
      await tx.sugerenciaProducto.deleteMany({
        where: { eventoId: id },
      });

      // Update evento and create new sugerencias
      return tx.eventoTendencia.update({
        where: { id },
        data: {
          ...eventoData,
          ...(eventoData.fecha ? { fecha: new Date(eventoData.fecha) } : {}),
          ...(eventoData.fechaFin !== undefined
            ? { fechaFin: eventoData.fechaFin ? new Date(eventoData.fechaFin) : null }
            : {}),
          ...(sugerencias
            ? {
                sugerencias: {
                  create: sugerencias.map((s: Record<string, unknown>) => ({
                    nombre: s.nombre,
                    descripcion: s.descripcion || null,
                    tipoProducto: s.tipoProducto || "replica",
                    dificultad: s.dificultad || "media",
                    potencialVenta: s.potencialVenta ?? 2,
                    ventanaInicio: s.ventanaInicio || null,
                    imagenRef: s.imagenRef || null,
                    modeloVinculadoId: s.modeloVinculadoId || null,
                  })),
                },
              }
            : {}),
        },
        include: {
          sugerencias: {
            include: {
              modeloVinculado: {
                select: { id: true, nombre: true, imagenUrl: true },
              },
            },
          },
        },
      });
    });

    return NextResponse.json(evento);
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

    const existing = await prisma.eventoTendencia.findFirst({
      where: { id, tenantId },
    });
    if (!existing)
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    // Sugerencias cascade on delete via Prisma schema
    await prisma.eventoTendencia.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
