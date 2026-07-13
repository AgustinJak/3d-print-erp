export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

/**
 * Instancia los gastos fijos de la plantilla en un mes: crea un CasaGasto por
 * cada fijo activo que todavía no exista en ese mes. Idempotente.
 */
export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const body = await request.json();
    const mes = parseInt(body.mes, 10);
    const anio = parseInt(body.anio, 10);
    if (!mes || !anio) {
      return NextResponse.json({ error: "mes/anio requeridos" }, { status: 400 });
    }

    const [fijos, gastosMes] = await Promise.all([
      prisma.casaFijo.findMany({ where: { tenantId, activo: true } }),
      prisma.casaGasto.findMany({ where: { tenantId, mes, anio, fijoId: { not: null } } }),
    ]);
    const yaCargados = new Set(gastosMes.map((g) => g.fijoId));

    const nuevos = fijos.filter((f) => !yaCargados.has(f.id));
    if (nuevos.length > 0) {
      await prisma.casaGasto.createMany({
        data: nuevos.map((f) => ({
          tenantId,
          grupo: "fijo",
          nombre: f.nombre,
          monto: f.monto,
          reparto: f.reparto,
          personaPaga: f.personaPaga,
          mes,
          anio,
          fijoId: f.id,
        })),
      });
    }

    return NextResponse.json({ ok: true, cargados: nuevos.length });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
