export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const { searchParams } = new URL(request.url);

    const tipo = searchParams.get("tipo");
    const nivelViral = searchParams.get("nivelViral");
    const desde = searchParams.get("desde");
    const hasta = searchParams.get("hasta");
    const activoParam = searchParams.get("activo");
    const activo = activoParam === null ? true : activoParam === "true";

    const where: Record<string, unknown> = { tenantId, activo };

    if (tipo) where.tipo = tipo;
    if (nivelViral) where.nivelViral = nivelViral;
    if (desde || hasta) {
      where.fecha = {
        ...(desde ? { gte: new Date(desde) } : {}),
        ...(hasta ? { lte: new Date(hasta) } : {}),
      };
    }

    const eventos = await prisma.eventoTendencia.findMany({
      where,
      orderBy: { fecha: "asc" },
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

    return NextResponse.json(eventos);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const body = await request.json();

    const { sugerencias, ...eventoData } = body;

    const evento = await prisma.eventoTendencia.create({
      data: {
        ...eventoData,
        tenantId,
        fecha: new Date(eventoData.fecha),
        ...(eventoData.fechaFin ? { fechaFin: new Date(eventoData.fechaFin) } : {}),
        ...(sugerencias && sugerencias.length > 0
          ? {
              sugerencias: {
                create: sugerencias,
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

    return NextResponse.json(evento, { status: 201 });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
