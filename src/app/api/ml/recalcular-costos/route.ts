export const dynamic = "force-dynamic";

import { costoModelo, costoVariante } from "@/lib/costos";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

/**
 * Recalcula el costo de fabricación de los pedidos de Mercado Libre usando la
 * configuración ACTUAL del catálogo.
 *
 * Hace falta porque marcar las variantes implícitas de una publicación sólo
 * afecta a los pedidos nuevos: los que ya estaban cargados conservan el costo
 * con el que entraron. Cada vez que se configura una publicación o se corrige
 * el costo de un modelo, la historia queda desalineada.
 *
 * Fórmula (la misma que aplica el sync):
 *   costo = modelo.costoFab + modelo.costoInsumos
 *         + variantes que mandó ML (las guardadas en variantesInfo)
 *         + variantes implícitas de la publicación
 *
 * Sólo toca items con `mlaOrigen`: si no sabemos de qué publicación vino, puede
 * ser una carga manual y el costo puesto a mano no se pisa.
 *
 * Body: { soloPreview?: boolean (default true), soloAumentos?: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const body = await request.json().catch(() => ({}));
    const soloPreview = body.soloPreview !== false; // por defecto NO escribe
    const soloAumentos = Boolean(body.soloAumentos);

    const publicaciones = await prisma.publicacionMl.findMany({
      where: { tenantId },
      select: { mla: true, variantesImplicitas: true },
    });
    const implicitasPorMla = new Map(publicaciones.map((p) => [p.mla, p.variantesImplicitas]));

    const items = await prisma.itemPedido.findMany({
      where: { mlaOrigen: { not: null }, pedido: { tenantId } },
      include: {
        modelo: { select: { nombre: true, costoFab: true, costoInsumos: true, variantes: true } },
        pedido: { select: { estado: true, fechaPedido: true, idMercadolibre: true } },
      },
    });

    type Cambio = {
      itemId: string;
      fecha: string;
      venta: string | null;
      estado: string;
      modelo: string;
      cantidad: number;
      costoAntes: number;
      costoDespues: number;
      delta: number;
      variantes: string[];
    };
    const suben: Cambio[] = [];
    const bajan: Cambio[] = [];

    for (const it of items) {
      const vi = Array.isArray(it.variantesInfo) ? (it.variantesInfo as Array<Record<string, unknown>>) : [];

      // Se acumulan por id para no sumar dos veces la misma variante cuando ML
      // la manda Y además está marcada como implícita en la publicación.
      const aplicadas = new Map<string, { nombre: string; costo: number }>();
      for (const v of vi) {
        if (!v?.matched || typeof v.varianteId !== "string") continue;
        const vv = it.modelo.variantes.find((x) => x.id === v.varianteId);
        if (vv) aplicadas.set(vv.id, { nombre: vv.nombre, costo: costoVariante(vv) });
      }
      for (const id of implicitasPorMla.get(it.mlaOrigen as string) ?? []) {
        const vv = it.modelo.variantes.find((x) => x.id === id);
        if (vv) aplicadas.set(vv.id, { nombre: vv.nombre, costo: costoVariante(vv) });
      }

      const costoDespues =
        costoModelo(it.modelo) + [...aplicadas.values()].reduce((a, v) => a + v.costo, 0);
      const delta = (costoDespues - it.costoUnitario) * it.cantidad;
      if (delta === 0) continue;

      const cambio: Cambio = {
        itemId: it.id,
        fecha: it.pedido.fechaPedido.toISOString().slice(0, 10),
        venta: it.pedido.idMercadolibre,
        estado: it.pedido.estado,
        modelo: it.modelo.nombre,
        cantidad: it.cantidad,
        costoAntes: it.costoUnitario,
        costoDespues,
        delta,
        variantes: [...aplicadas.values()].map((v) => v.nombre),
      };
      (delta > 0 ? suben : bajan).push(cambio);
    }

    const aAplicar = soloAumentos ? suben : [...suben, ...bajan];
    let aplicados = 0;
    if (!soloPreview) {
      for (const c of aAplicar) {
        await prisma.itemPedido.update({
          where: { id: c.itemId },
          data: { costoUnitario: c.costoDespues },
        });
        aplicados++;
      }
    }

    const suma = (xs: Cambio[]) => xs.reduce((a, c) => a + c.delta, 0);
    return NextResponse.json({
      ok: true,
      soloPreview,
      soloAumentos,
      itemsRevisados: items.length,
      aplicados,
      resumen: {
        suben: suben.length,
        bajan: bajan.length,
        deltaSuben: suma(suben),
        deltaBajan: suma(bajan),
        deltaNeto: suma(suben) + suma(bajan),
      },
      // ordenados por impacto para que lo importante quede arriba
      suben: suben.sort((a, b) => b.delta - a.delta).slice(0, 60),
      bajan: bajan.sort((a, b) => a.delta - b.delta).slice(0, 60),
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
