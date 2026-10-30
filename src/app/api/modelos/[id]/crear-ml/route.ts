export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { borrador, crear, revisar } from "@/lib/crear-ml";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/**
 * Crear en Mercado Libre una combinación del producto (docs/sdd/006, spec 008). Nunca automático.
 *
 * GET ?combinacion=: el borrador que propone el ERP. POST sin `aplicar`: lo que dicen el ERP y
 * ML (`/items/validate`), sin crear nada. Con `aplicar`: crea, pausa, enlaza y registra.
 */
const Cuerpo = z.object({
  combinacionId: z.string().min(1),
  nombre: z.string().min(3).max(60),
  categoria: z.string().regex(/^MLA\d+$/),
  precio1: z.number().positive(),
  opcion2: z.boolean(),
  precio2: z.number().positive().nullable(),
  paquete: z.object({ alto: z.number().positive(), ancho: z.number().positive(), largo: z.number().positive(), peso: z.number().positive() }),
  stock: z.number().int().min(1).max(999),
  fotos: z.array(z.string().url()).max(10),
  aplicar: z.boolean().optional(),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const { id } = await params;
    const combinacion = request.nextUrl.searchParams.get("combinacion");
    if (!combinacion) return NextResponse.json({ error: "falta la combinación" }, { status: 400 });
    return NextResponse.json(await borrador(tenantId, id, combinacion));
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { tenantId, user } = await getAuthenticatedTenantNonDemo();
    const cuerpo = Cuerpo.safeParse(await request.json().catch(() => null));
    if (!cuerpo.success) return NextResponse.json({ error: "Revisá los datos: nombre de 3 a 60 letras, categoría, precio, medidas y stock." }, { status: 400 });
    const { aplicar, ...pedido } = cuerpo.data;
    if (!aplicar) return NextResponse.json({ revisiones: await revisar(tenantId, pedido) });
    return NextResponse.json({ creadas: await crear(tenantId, pedido, user.email ?? user.id) });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
