export const dynamic = "force-dynamic";
// El Shop baja y optimiza cada foto al crear: puede tardar varios segundos por foto.
export const maxDuration = 300;

import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { borradorShop, mandarAlShop } from "@/lib/crear-shop";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/**
 * Crear el producto en el Shop (contrato 7c, docs/sdd/009). Nunca automático.
 *
 * GET: el borrador que propone el ERP. POST con `simular: true`: lo que dice el Shop, sin crear
 * nada. Con `simular: false`: lo crea oculto y mapea cada combinación a su clave del Shop.
 */
const medida = z.number().positive().nullable();
const Cuerpo = z.object({
  nombre: z.string().trim().min(2).max(120),
  descripcion: z.string().max(5000).nullable(),
  categoriaId: z.string().uuid().nullable(),
  peso: medida,
  alto: medida,
  ancho: medida,
  largo: medida,
  fotos: z.array(z.string().url()).max(15),
  simular: z.boolean(),
});

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const { id } = await params;
    return NextResponse.json(await borradorShop(tenantId, id));
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId, user } = await getAuthenticatedTenantNonDemo();
    const { id } = await params;
    const cuerpo = Cuerpo.safeParse(await request.json().catch(() => null));
    if (!cuerpo.success) return NextResponse.json({ error: "Revisá los datos: nombre de 2 a 120 letras, descripción de hasta 5.000, medidas positivas." }, { status: 400 });
    const { simular, ...pedido } = cuerpo.data;
    return NextResponse.json(await mandarAlShop(tenantId, id, pedido, simular, user.email ?? user.id));
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
