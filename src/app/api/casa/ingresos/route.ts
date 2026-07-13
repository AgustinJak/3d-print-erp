export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

/** Carga/actualiza el ingreso de una persona para un mes. */
export async function PUT(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const body = await request.json();
    const persona = body.persona === "tai" ? "tai" : "sendero";
    const monto = parseFloat(body.monto) || 0;
    const mes = parseInt(body.mes, 10);
    const anio = parseInt(body.anio, 10);
    if (!mes || !anio) {
      return NextResponse.json({ error: "mes/anio requeridos" }, { status: 400 });
    }

    const ingreso = await prisma.casaIngreso.upsert({
      where: { tenantId_persona_mes_anio: { tenantId, persona, mes, anio } },
      create: { tenantId, persona, monto, mes, anio },
      update: { monto },
    });
    return NextResponse.json(ingreso);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
