export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { asegurarCombinacion } from "@/lib/combinaciones";
import { getAuthenticatedTenant, getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import type { Prisma } from "@/generated/prisma";
import { NextRequest, NextResponse } from "next/server";

/**
 * Combinaciones vendibles (docs/sdd/001, spec 001).
 *
 * GET `?modeloId=` las de un modelo; `?q=` busca por nombre o SKU (para el
 * diálogo de pedido y el mapeo). Por defecto sólo las activas; `?todas=1` suma
 * las desactivadas.
 */
export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const sp = request.nextUrl.searchParams;
    const modeloId = sp.get("modeloId");
    const q = sp.get("q")?.trim();

    const where: Prisma.CombinacionWhereInput = { tenantId };
    if (sp.get("todas") !== "1") where.activo = true;
    if (modeloId) where.modeloId = modeloId;
    if (q) {
      // Cada palabra en cualquier parte: "tanjiro 95 con" encuentra
      // "Tanjiro Katana nueva 95cm · Con Funda".
      where.AND = q
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 6)
        .map((p) => ({
          OR: [{ nombre: { contains: p, mode: "insensitive" as const } }, { sku: { contains: p.toUpperCase() } }],
        }));
    }

    const combinaciones = await prisma.combinacion.findMany({
      where,
      select: { id: true, modeloId: true, variantes: true, sku: true, nombre: true, activo: true },
      orderBy: { nombre: "asc" },
      take: q ? 30 : 500,
    });
    return NextResponse.json(combinaciones);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}

/**
 * Crea la combinación de un modelo con esas variantes. Si ya existe (aunque las
 * variantes vengan en otro orden), devuelve la existente (spec 001, CA-5).
 */
export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const body: { modeloId?: string; variantes?: string[] } = await request.json();
    if (!body.modeloId) return NextResponse.json({ error: "modeloId requerido" }, { status: 400 });
    const c = await asegurarCombinacion(prisma, tenantId, body.modeloId, body.variantes ?? []);
    return NextResponse.json(c, { status: c.creada ? 201 : 200 });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
