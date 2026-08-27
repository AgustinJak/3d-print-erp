export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { siguienteNumero, sugerirSku } from "@/lib/sku";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET  → sugiere el SKU para un modelo nuevo (lo usa el formulario).
 *        /api/modelos/skus?serie=Demon%20Slayer&categoria=Katanas
 */
export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const { searchParams } = new URL(request.url);
    const existentes = await prisma.modelo.findMany({
      where: { tenantId, sku: { not: null } },
      select: { sku: true },
    });
    const sugerencia = sugerirSku(
      searchParams.get("serie"),
      searchParams.get("categoria"),
      siguienteNumero(existentes.map((m) => m.sku)),
    );
    return NextResponse.json(sugerencia);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * POST → completa el SKU de todos los modelos activos que no lo tengan.
 *
 * Body: { soloPreview?: boolean (default true) }
 *
 * Nunca pisa un SKU que ya existe, y no inventa códigos: los modelos sin serie
 * ni categoría vuelven en `faltanDatos` para que alguien los complete primero.
 */
export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const body = await request.json().catch(() => ({}));
    const soloPreview = body.soloPreview !== false;

    const modelos = await prisma.modelo.findMany({
      where: { tenantId, activo: true, consolidadoEnId: null },
      include: { categorias: { include: { categoria: { select: { nombre: true } } } } },
      orderBy: { nombre: "asc" },
    });

    const usados = new Set(
      modelos.map((m) => m.sku).filter((s): s is string => Boolean(s)),
    );
    let numero = siguienteNumero([...usados]);

    const generados: Array<{ id: string; nombre: string; sku: string; serie: string; categoria: string }> = [];
    const faltanDatos: Array<{ id: string; nombre: string; falta: string }> = [];

    for (const m of modelos) {
      if (m.sku) continue;
      const categoria = m.categorias[0]?.categoria.nombre ?? null;
      const { sku, falta } = sugerirSku(m.serie, categoria, numero);
      if (!sku) {
        faltanDatos.push({ id: m.id, nombre: m.nombre, falta: falta ?? "datos" });
        continue;
      }
      // por si el correlativo choca con uno cargado a mano
      let candidato = sku;
      while (usados.has(candidato)) {
        numero++;
        candidato = sugerirSku(m.serie, categoria, numero).sku as string;
      }
      usados.add(candidato);
      numero++;
      generados.push({
        id: m.id,
        nombre: m.nombre,
        sku: candidato,
        serie: m.serie ?? "",
        categoria: categoria ?? "",
      });
    }

    if (!soloPreview) {
      for (const g of generados) {
        await prisma.modelo.update({ where: { id: g.id }, data: { sku: g.sku } });
      }
    }

    return NextResponse.json({
      ok: true,
      soloPreview,
      totalActivos: modelos.length,
      yaTenian: modelos.filter((m) => m.sku).length,
      generados,
      faltanDatos,
      aplicados: soloPreview ? 0 : generados.length,
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
