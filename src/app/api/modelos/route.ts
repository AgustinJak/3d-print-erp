export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { asegurarFilasDeStock } from "@/lib/stock-filas";
import { parsePrice } from "@/lib/utils";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const { searchParams } = new URL(request.url);
    const categoriaId = searchParams.get("categoriaId");
    const activoParam = searchParams.get("activo");
    // consolidados: "ocultar" (default) | "solo" | "incluir"
    const consolidados = searchParams.get("consolidados") || "ocultar";

    const where: Record<string, unknown> = { tenantId };
    if (categoriaId) {
      where.categorias = { some: { categoriaId } };
    }
    if (activoParam !== null) {
      where.activo = activoParam === "true";
    }
    if (consolidados === "ocultar") {
      where.consolidadoEnId = null;
    } else if (consolidados === "solo") {
      where.consolidadoEnId = { not: null };
    }

    const modelos = await prisma.modelo.findMany({
      where,
      orderBy: { creadoEn: "desc" },
      include: {
        categorias: { include: { categoria: true } },
        variantes: true,
        consolidadoEn: { select: { id: true, nombre: true } },
      },
    });
    return NextResponse.json(modelos);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const body = await request.json();

    const categoriaIds: string[] = body.categoriaIds ?? [];

    const modelo = await prisma.modelo.create({
      data: {
        nombre: body.nombre,
        sku: body.sku?.trim() ? body.sku.trim() : null,
        serie: body.serie || null,
        pesoGr: body.pesoGr ? parsePrice(body.pesoGr) : null,
        costoFab: body.costoFab ? parsePrice(body.costoFab) : 0,
        costoInsumos: body.costoInsumos ? parsePrice(body.costoInsumos) : 0,
        precioVenta: body.precioVenta ? parsePrice(body.precioVenta) : 0,
        precioCreditoPorc: body.precioCreditoPorc != null ? parseFloat(body.precioCreditoPorc) : 10,
        precioMayorista: body.precioMayorista ? parsePrice(body.precioMayorista) : null,
        precioPromo: body.precioPromo ? parsePrice(body.precioPromo) : null,
        notas: body.notas || null,
        archivo3mfUrl: body.archivo3mfUrl || null,
        imagenUrl: body.imagenUrl || null,
        imagenesUrls: body.imagenesUrls ?? [],
        activo: body.activo ?? true,
        tenantId,
        categorias: categoriaIds.length > 0
          ? { create: categoriaIds.map((catId: string) => ({ categoriaId: catId })) }
          : undefined,
        variantes: body.variantes?.length > 0
          ? { create: body.variantes.map((v: { nombre: string; precioAdicional?: number; costoFabAdicional?: number; costoInsumosAdicional?: number; notas?: string }) => ({
              nombre: v.nombre,
              precioAdicional: parsePrice(v.precioAdicional),
              costoFabAdicional: parsePrice(v.costoFabAdicional),
              costoInsumosAdicional: parsePrice(v.costoInsumosAdicional),
              notas: v.notas || null,
            })) }
          : undefined,
      },
      include: {
        categorias: { include: { categoria: true } },
        variantes: true,
      },
    });
    // Que aparezca en /stock desde el día uno: si no, queda publicado pero
    // invisible, y no se puede ni contar ni reservar.
    await asegurarFilasDeStock(tenantId, modelo.id);

    return NextResponse.json(modelo, { status: 201 });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
