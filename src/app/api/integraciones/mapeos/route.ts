export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { ESTADOS_QUE_RESERVAN } from "@/lib/reservas";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import type { Prisma } from "@/generated/prisma";
import { NextRequest, NextResponse } from "next/server";

/**
 * El mapeo por canal (docs/sdd/001, spec 004): la cola y todas las claves.
 *
 * `?canal=mercadolibre|shop`, `?estado=cola|todos` (por defecto cola), `?q=`
 * busca en la descripción, la clave y la combinación. `?resumen=1` devuelve sólo
 * los conteos, para la pestaña.
 *
 * En la cola está lo que no es de otro negocio y no apunta a una combinación que
 * se venda: sin combinación, o con una desactivada.
 */
export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const sp = request.nextUrl.searchParams;

    const enCola: Prisma.MapeoCanalWhereInput = {
      ignorar: false,
      OR: [{ combinacionId: null }, { combinacion: { activo: false } }],
    };

    const [colaMl, colaShop, total] = await Promise.all([
      prisma.mapeoCanal.count({ where: { tenantId, canal: "mercadolibre", ...enCola } }),
      prisma.mapeoCanal.count({ where: { tenantId, canal: "shop", ...enCola } }),
      prisma.mapeoCanal.count({ where: { tenantId } }),
    ]);
    const resumen = { cola: colaMl + colaShop, colaMl, colaShop, total };
    if (sp.get("resumen") === "1") return NextResponse.json(resumen);

    const canal = sp.get("canal");
    const estado = sp.get("estado") ?? "cola";
    const q = sp.get("q")?.trim();
    const where: Prisma.MapeoCanalWhereInput = {
      tenantId,
      ...(canal === "mercadolibre" || canal === "shop" ? { canal } : {}),
      ...(estado === "cola" ? enCola : {}),
      ...(q
        ? {
            AND: q
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 6)
              .map((p) => ({
                OR: [
                  { descripcion: { contains: p, mode: "insensitive" as const } },
                  { clave: { contains: p, mode: "insensitive" as const } },
                  { combinacion: { nombre: { contains: p, mode: "insensitive" as const } } },
                  { combinacion: { sku: { contains: p.toUpperCase() } } },
                ],
              })),
          }
        : {}),
    };

    const mapeos = await prisma.mapeoCanal.findMany({
      where,
      include: { combinacion: { select: { id: true, nombre: true, sku: true, activo: true } } },
      orderBy: [{ vecesVista: "desc" }, { updatedAt: "desc" }],
      take: 500,
    });

    // Cuántas líneas de pedidos abiertos esperan cada clave de la cola.
    const claves = mapeos.filter((m) => !m.combinacion?.activo && !m.ignorar).map((m) => m.clave);
    const esperando = claves.length
      ? await prisma.itemPedido.groupBy({
          by: ["claveCanal"],
          where: { claveCanal: { in: claves }, combinacionId: null, pedido: { tenantId, estado: { in: [...ESTADOS_QUE_RESERVAN] } } },
          _count: { _all: true },
        })
      : [];
    const porClave = new Map(esperando.map((e) => [e.claveCanal, e._count._all]));

    return NextResponse.json({
      ...resumen,
      mapeos: mapeos.map((m) => ({
        id: m.id,
        canal: m.canal,
        clave: m.clave,
        descripcion: m.descripcion,
        muestra: m.muestra,
        unidades: m.unidades,
        ignorar: m.ignorar,
        origen: m.origen,
        vecesVista: m.vecesVista,
        ultimaVenta: m.ultimaVenta,
        actualizado: m.updatedAt,
        combinacion: m.combinacion,
        enCola: !m.ignorar && !m.combinacion?.activo,
        lineasEsperando: porClave.get(m.clave) ?? 0,
      })),
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
