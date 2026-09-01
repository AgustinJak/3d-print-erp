export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { clavesDeOrden } from "@/lib/reservas";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const { tenantId } = await getAuthenticatedTenant();

    // Obtener todos los pedidos en producción o confirmados, con sus items
    const pedidos = await prisma.pedido.findMany({
      where: {
        tenantId,
        estado: { in: ["CONFIRMADO", "EN_PRODUCCION"] },
      },

      include: {
        cliente: { select: { id: true, nombre: true } },
        items: {
          include: {
            modelo: {
              select: {
                id: true,
                nombre: true,
                imagenUrl: true,
                categorias: {
                  include: { categoria: true },
                },
              },
            },
          },
        },
      },
    });

    // Mismo orden con el que se reparte el stock (ver `clavesDeOrden`): el que
    // aparece primero acá es el que se queda con la pieza si no alcanza.
    pedidos.sort((a, b) => {
      const ka = clavesDeOrden(a);
      const kb = clavesDeOrden(b);
      for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
      return 0;
    });

    return NextResponse.json(pedidos);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
