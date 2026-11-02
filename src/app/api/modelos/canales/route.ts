export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import type { LecturaMl } from "@/lib/precios-ml";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextResponse } from "next/server";

/** Dónde está publicado cada producto (Productos, filtros y acciones en cantidad; 2026-11-02). */
export interface CanalesDeModelo {
  /** Publicaciones de ML por estado, según la última lectura de precios. */
  ml: { activas: number; pausadas: number; otras: number };
  /**
   * Las publicaciones activas y pausadas, para cambiarles la entrega (Flex o a pedido) en cantidad.
   * Con la entrega según la última lectura: cuántas tienen Flex y cuántas están a pedido.
   */
  mlas: string[];
  entrega: { flex: number; aPedido: number };
  /** Claves del Shop enlazadas. */
  web: number;
  /** Combinaciones activas que no tienen publicación de ML: las que se pueden crear. */
  sinMl: Array<{ id: string; nombre: string }>;
}

/**
 * GET /api/modelos/canales — por producto, sus publicaciones de ML (activas, pausadas) y de la web,
 * y las combinaciones sin publicar en ML. Las publicaciones de Shay no cuentan.
 */
export async function GET() {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const [mapeos, combinaciones] = await Promise.all([
      prisma.mapeoCanal.findMany({
        where: { tenantId, ignorar: false, combinacionId: { not: null }, canal: { in: ["mercadolibre", "shop"] } },
        select: { canal: true, clave: true, combinacionId: true, precioLectura: true, combinacion: { select: { modeloId: true } } },
      }),
      prisma.combinacion.findMany({ where: { tenantId, activo: true }, select: { id: true, nombre: true, modeloId: true } }),
    ]);
    const out: Record<string, CanalesDeModelo> = {};
    const de = (id: string) => (out[id] ??= { ml: { activas: 0, pausadas: 0, otras: 0 }, mlas: [], entrega: { flex: 0, aPedido: 0 }, web: 0, sinMl: [] });
    const conMl = new Set<string>();
    const vistas = new Set<string>();
    for (const m of mapeos) {
      if (!m.combinacion) continue;
      const c = de(m.combinacion.modeloId);
      if (m.canal === "shop") {
        c.web++;
        continue;
      }
      conMl.add(m.combinacionId!);
      // Una publicación con variaciones tiene una clave por variación: se cuenta una vez.
      const mla = m.clave.split("|")[0];
      if (vistas.has(`${m.combinacion.modeloId}|${mla}`)) continue;
      vistas.add(`${m.combinacion.modeloId}|${mla}`);
      const lectura = m.precioLectura as unknown as LecturaMl | null;
      const estado = lectura?.estado;
      if (estado === "active") c.ml.activas++;
      else if (estado === "paused") c.ml.pausadas++;
      else c.ml.otras++;
      if (estado === "active" || estado === "paused") c.mlas.push(mla);
      if (lectura?.flex) c.entrega.flex++;
      if (lectura?.disponibilidad) c.entrega.aPedido++;
    }
    for (const c of combinaciones) if (!conMl.has(c.id)) de(c.modeloId).sinMl.push({ id: c.id, nombre: c.nombre });
    return NextResponse.json(out);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
