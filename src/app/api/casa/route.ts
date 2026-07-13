export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

/**
 * Resumen del mes de la finanza del hogar ("Casa").
 * Devuelve ingresos, gastos por grupo con el reparto entre las dos personas, y
 * el ahorro de cada una.
 *
 * Reparto por gasto:
 *  - "proporcional": según la proporción de ingresos
 *  - "mitad": 50/50
 *  - "personal": 100% a `personaPaga`
 */
export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const { searchParams } = new URL(request.url);
    const ahora = new Date();
    const mes = parseInt(searchParams.get("mes") || String(ahora.getMonth() + 1), 10);
    const anio = parseInt(searchParams.get("anio") || String(ahora.getFullYear()), 10);

    const [ingresos, gastos, fijos] = await Promise.all([
      prisma.casaIngreso.findMany({ where: { tenantId, mes, anio } }),
      prisma.casaGasto.findMany({ where: { tenantId, mes, anio }, orderBy: { creadoEn: "asc" } }),
      prisma.casaFijo.findMany({ where: { tenantId, activo: true }, orderBy: { orden: "asc" } }),
    ]);

    const ingTai = ingresos.find((i) => i.persona === "tai")?.monto ?? 0;
    const ingSendero = ingresos.find((i) => i.persona === "sendero")?.monto ?? 0;
    const totalIngreso = ingTai + ingSendero;
    const propTai = totalIngreso > 0 ? ingTai / totalIngreso : 0.5;
    const propSendero = totalIngreso > 0 ? ingSendero / totalIngreso : 0.5;

    const parte = (g: { monto: number; reparto: string; personaPaga: string | null }) => {
      if (g.reparto === "mitad") return { tai: g.monto / 2, sendero: g.monto / 2 };
      if (g.reparto === "personal") {
        return g.personaPaga === "tai"
          ? { tai: g.monto, sendero: 0 }
          : { tai: 0, sendero: g.monto };
      }
      // proporcional
      return { tai: g.monto * propTai, sendero: g.monto * propSendero };
    };

    const grupos: Record<string, Array<Record<string, unknown>>> = { fijo: [], ocio: [], inversion: [] };
    let tocaTai = 0;
    let tocaSendero = 0;
    const totalGrupo: Record<string, number> = { fijo: 0, ocio: 0, inversion: 0 };

    for (const g of gastos) {
      const p = parte(g);
      tocaTai += p.tai;
      tocaSendero += p.sendero;
      if (grupos[g.grupo]) {
        grupos[g.grupo].push({
          id: g.id,
          nombre: g.nombre,
          monto: g.monto,
          reparto: g.reparto,
          personaPaga: g.personaPaga,
          parteTai: Math.round(p.tai),
          parteSendero: Math.round(p.sendero),
          fijoId: g.fijoId,
        });
        totalGrupo[g.grupo] += g.monto;
      }
    }

    const gastoTotal = totalGrupo.fijo + totalGrupo.ocio + totalGrupo.inversion;

    // ¿Faltan cargar fijos este mes? (hay plantilla activa pero no se instanció)
    const fijosInstanciados = new Set(gastos.filter((g) => g.fijoId).map((g) => g.fijoId));
    const fijosPendientes = fijos.filter((f) => !fijosInstanciados.has(f.id)).length;

    return NextResponse.json({
      mes,
      anio,
      ingresos: {
        tai: ingTai,
        sendero: ingSendero,
        total: totalIngreso,
        propTai,
        propSendero,
      },
      gastos: grupos,
      totales: {
        gastoTotal,
        gastoFijo: totalGrupo.fijo,
        gastoOcio: totalGrupo.ocio,
        gastoInversion: totalGrupo.inversion,
        tocaTai: Math.round(tocaTai),
        tocaSendero: Math.round(tocaSendero),
        ahorroTai: Math.round(ingTai - tocaTai),
        ahorroSendero: Math.round(ingSendero - tocaSendero),
        ahorroTotal: Math.round(totalIngreso - gastoTotal),
      },
      plantillaFijos: fijos,
      fijosPendientes,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
