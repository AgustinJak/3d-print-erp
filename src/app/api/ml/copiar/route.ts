export const dynamic = "force-dynamic";
// Crear lleva varias llamadas por publicación (crear, pausar, descripción).
export const maxDuration = 300;

import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { copiarPublicaciones, cuentaDeDestino, fuentesDeCopia } from "@/lib/copiar-ml";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/**
 * Copiar publicaciones de Sendero 3D a otra cuenta de ML (docs/sdd/010, TASK-007). Nunca automático.
 *
 * GET ?mlas=A,B: qué se copiaría de cada una y a qué cuenta. POST con `crear: false`: revisa contra
 * ML sin crear nada. Con `crear: true`: crea pausadas y las enlaza. Hasta 10 por pedido.
 */
const Cuerpo = z.object({
  destino: z.string().min(1),
  crear: z.boolean(),
  pedidos: z.array(z.object({ mla: z.string().regex(/^MLA\d+$/), titulo: z.string().max(200) })).min(1).max(10),
});

export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const mlas = (request.nextUrl.searchParams.get("mlas") ?? "").split(",").filter((m) => /^MLA\d+$/.test(m)).slice(0, 200);
    const destino = await cuentaDeDestino(tenantId);
    if (!destino) return NextResponse.json({ destino: null, fuentes: [] });
    return NextResponse.json({ destino: { id: destino.id, nombre: destino.nombre ?? destino.nickname }, fuentes: await fuentesDeCopia(tenantId, mlas, destino.id) });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { tenantId, user } = await getAuthenticatedTenantNonDemo();
    const cuerpo = Cuerpo.safeParse(await request.json().catch(() => null));
    if (!cuerpo.success) return NextResponse.json({ error: "pedido inválido" }, { status: 400 });
    const destino = await cuentaDeDestino(tenantId, cuerpo.data.destino);
    if (!destino) return NextResponse.json({ error: "Esa cuenta de destino no existe (o es la principal)." }, { status: 400 });
    return NextResponse.json({ resultados: await copiarPublicaciones(tenantId, destino.id, cuerpo.data.pedidos, cuerpo.data.crear, user.email ?? user.id) });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
