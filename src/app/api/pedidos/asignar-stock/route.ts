export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma";
import { reasignarReservas } from "@/lib/reservas";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

/**
 * Elegir a mano de qué unidad de stock sale un item de un pedido.
 *
 * Hace falta porque Mercado Libre vende algunos productos sin preguntar la
 * variante: la Bola de JOJOS, el Sauce y el porta auricular NUBE se publican
 * sin elegir color, pero acá el stock va separado por color. La venta llega sin
 * decir cuál, y el reparto no puede adivinar — descontar la fila equivocada
 * ensucia el conteo de las dos y nadie se entera hasta el próximo inventario.
 *
 * Asignar es completar el dato que ML no mandó: se escribe la variante en el
 * item igual que si hubiera venido de la publicación. De ahí en adelante el
 * pedido reserva, descuenta y queda en el historial como cualquier otro.
 */
export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const { itemId, stockId }: { itemId?: string; stockId?: string } = await request.json();
    if (!itemId || !stockId) {
      return NextResponse.json({ error: "itemId y stockId requeridos" }, { status: 400 });
    }

    const item = await prisma.itemPedido.findFirst({
      where: { id: itemId, pedido: { tenantId } },
      select: { id: true, modeloId: true, variantesInfo: true },
    });
    if (!item) return NextResponse.json({ error: "item no encontrado" }, { status: 404 });

    const fila = await prisma.stock.findFirst({ where: { id: stockId, tenantId } });
    if (!fila) return NextResponse.json({ error: "unidad de stock no encontrada" }, { status: 404 });
    // Elegir el color es una cosa; cambiar de producto, otra. No se permite.
    if (fila.modeloId !== item.modeloId) {
      return NextResponse.json({ error: "esa unidad de stock es de otro modelo" }, { status: 400 });
    }

    const [variantesDeLaFila, variantesQueParten] = await Promise.all([
      prisma.varianteModelo.findMany({
        where: { id: { in: fila.variantes } },
        select: { id: true, nombre: true },
      }),
      prisma.varianteModelo.findMany({
        where: { modeloId: item.modeloId, afectaStock: true },
        select: { id: true },
      }),
    ]);
    const parten = new Set(variantesQueParten.map((v) => v.id));

    // Se conserva lo que mandó ML —aunque no haya matcheado, es el registro de
    // lo que pidió el comprador— y se reemplaza sólo lo que define qué pieza
    // sale del galpón. Así reasignar dos veces no acumula colores.
    const previo = Array.isArray(item.variantesInfo)
      ? (item.variantesInfo as Array<Record<string, unknown>>)
      : [];
    const conservado = previo.filter(
      (v) => !(v?.matched === true && typeof v.varianteId === "string" && parten.has(v.varianteId))
    );
    const asignado = variantesDeLaFila.map((v) => ({
      nombre: v.nombre,
      varianteId: v.id,
      matched: true,
      asignadoEnErp: true,
    }));

    await prisma.itemPedido.update({
      where: { id: item.id },
      data: { variantesInfo: [...conservado, ...asignado] as Prisma.InputJsonValue },
    });

    // Ya hay a qué descontarle: que el pedido agarre su lugar en la cola.
    const reparto = await reasignarReservas(tenantId);

    return NextResponse.json({ ok: true, etiqueta: fila.etiqueta, reparto });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
