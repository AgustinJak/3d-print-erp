export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const { searchParams } = new URL(request.url);
    const mes = searchParams.get("mes");
    const anio = searchParams.get("anio");

    let where: Record<string, unknown> = { tenantId };
    if (mes && anio) {
      const inicio = new Date(parseInt(anio), parseInt(mes) - 1, 1);
      const fin = new Date(parseInt(anio), parseInt(mes), 1);
      where = { tenantId, fecha: { gte: inicio, lt: fin } };
    } else if (anio) {
      const inicio = new Date(parseInt(anio), 0, 1);
      const fin = new Date(parseInt(anio) + 1, 0, 1);
      where = { tenantId, fecha: { gte: inicio, lt: fin } };
    }

    const gastos = await prisma.gasto.findMany({
      where,
      orderBy: { fecha: "desc" },
    });
    return NextResponse.json(gastos);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const body = await request.json();
    const gasto = await prisma.gasto.create({
      data: {
        fecha: body.fecha ? new Date(body.fecha) : new Date(),
        categoria: body.categoria,
        monto: parseFloat(body.monto),
        descripcion: body.descripcion || null,
        tenantId,
      },
    });
    return NextResponse.json(gasto, { status: 201 });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
