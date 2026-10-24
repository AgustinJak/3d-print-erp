export const dynamic = "force-dynamic";

import {
  borrarGrupo,
  cambiarTipoDeGrupo,
  crearGrupo,
  ErrorDeCatalogo,
  esTipo,
  renombrarGrupo,
  type TipoGrupo,
} from "@/lib/catalogo";
import { reasignarReservas } from "@/lib/reservas";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

/**
 * Grupos de variantes de un producto (docs/sdd/004, spec 003).
 *
 *   POST   { nombre, tipo, opciones?, insumoStockId? }  → crea el grupo
 *   PATCH  { grupo, nombre?, tipo? }                     → renombra o cambia de tipo
 *   DELETE ?grupo=<nombre>                               → lo borra con sus opciones
 *
 * Todo lo que cambia qué reserva cada venta (filas de stock, recetas) termina repartiendo.
 */

function error(e: unknown) {
  if (e instanceof NextResponse) return e;
  if (e instanceof ErrorDeCatalogo) return NextResponse.json({ error: e.message }, { status: e.status });
  const msg = e instanceof Error ? e.message : "error";
  return NextResponse.json({ error: msg }, { status: 500 });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const { id } = await params;
    const body: { nombre?: string; tipo?: string; opciones?: unknown; insumoStockId?: string | null } = await request.json().catch(() => ({}));
    if (!esTipo(body.tipo)) throw new ErrorDeCatalogo("el tipo tiene que ser pieza, insumo o decoracion");
    const opciones = Array.isArray(body.opciones) ? body.opciones.filter((x): x is string => typeof x === "string") : [];
    await crearGrupo(tenantId, id, { nombre: body.nombre ?? "", tipo: body.tipo, opciones, insumoStockId: body.insumoStockId ?? null });
    await reasignarReservas(tenantId);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    return error(e);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const { id } = await params;
    const body: { grupo?: string; nombre?: string; tipo?: string } = await request.json().catch(() => ({}));
    if (!body.grupo) throw new ErrorDeCatalogo("falta el grupo");
    let filasQueQuedan = 0;
    if (body.tipo !== undefined) {
      if (!esTipo(body.tipo)) throw new ErrorDeCatalogo("el tipo tiene que ser pieza, insumo o decoracion");
      filasQueQuedan = (await cambiarTipoDeGrupo(tenantId, id, body.grupo, body.tipo as TipoGrupo)).filasQueQuedan;
      await reasignarReservas(tenantId);
    }
    if (body.nombre !== undefined) await renombrarGrupo(tenantId, id, body.grupo, body.nombre);
    return NextResponse.json({ ok: true, filasQueQuedan });
  } catch (e) {
    return error(e);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const { id } = await params;
    const grupo = request.nextUrl.searchParams.get("grupo");
    if (!grupo) throw new ErrorDeCatalogo("falta el grupo");
    const r = await borrarGrupo(tenantId, id, grupo);
    await reasignarReservas(tenantId);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return error(e);
  }
}
