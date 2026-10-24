export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { fabricacionDePieza, leerParametros, leerRecetas } from "@/lib/costos-bodega";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { NextResponse } from "next/server";

export interface PiezaDeBodega {
  id: string;
  nombre: string;
  categoria: string | null;
  /** Fabricación + insumos de Bodega, con el material de la pieza. null = sin receta. */
  costo: number | null;
  /** La fila del ERP a la que está enganchada, si alguna. */
  fila: { id: string; etiqueta: string | null; modeloId: string; modelo: string } | null;
}

/**
 * GET /api/bodega/piezas
 *
 * Las piezas de Bodega para el selector de la página del producto (docs/sdd/004,
 * spec 003, RN-6): primero las sueltas, después las enganchadas, con a qué fila.
 * Bodega es de un solo negocio: la cuenta demo no las ve.
 */
export async function GET() {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    if (tenantId !== "sendero3d") return NextResponse.json([]);

    const [piezas, filas, parametros, recetas] = await Promise.all([
      prisma.$queryRaw<Array<{ id: string; name: string; category: string | null }>>`
        SELECT id, name, category FROM bodega.models ORDER BY name
      `,
      prisma.stock.findMany({
        where: { tenantId, bodegaModelId: { not: null } },
        select: { id: true, etiqueta: true, bodegaModelId: true, modeloId: true, modelo: { select: { nombre: true } } },
      }),
      leerParametros(),
      leerRecetas(),
    ]);

    const filaDe = new Map(filas.map((f) => [f.bodegaModelId!, f]));
    const out: PiezaDeBodega[] = piezas.map((p) => {
      const r = recetas.get(p.id);
      const f = filaDe.get(p.id);
      return {
        id: p.id,
        nombre: p.name,
        categoria: p.category,
        costo: r ? Math.round(fabricacionDePieza(parametros, r) + (r.insumos ?? 0)) : null,
        fila: f ? { id: f.id, etiqueta: f.etiqueta, modeloId: f.modeloId, modelo: f.modelo.nombre } : null,
      };
    });
    out.sort((a, b) => Number(!!a.fila) - Number(!!b.fila) || a.nombre.localeCompare(b.nombre, "es"));
    return NextResponse.json(out);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
