export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import {
  calcularCierreTercero,
  descuentosPrevios,
  guardarDescuentos,
  leerCierreTercero,
} from "@/lib/ventas-terceros";
import { NextRequest, NextResponse } from "next/server";

/**
 * Ventas de Shay Juguetes en la cuenta de ML compartida.
 *
 * GET   → el cierre guardado del mes (rápido, no llama a ML). `null` si nunca
 *         se calculó: la UI ofrece el botón para hacerlo. Trae también los
 *         descuentos del último mes cargado, como propuesta.
 * POST  → recalcula las ventas desde ML y las guarda. Tarda unos segundos.
 * PATCH → guarda los descuentos (publicidad, percepciones, convenio,
 *         monotributo). No toca las ventas.
 */
export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const { searchParams } = new URL(request.url);
    const anio = parseInt(searchParams.get("anio") || "", 10);
    const mes = parseInt(searchParams.get("mes") || "", 10);
    if (!anio || !mes) return NextResponse.json({ error: "anio y mes requeridos" }, { status: 400 });

    const [cierre, previo] = await Promise.all([
      leerCierreTercero(tenantId, anio, mes),
      descuentosPrevios(tenantId, anio, mes),
    ]);
    return NextResponse.json({ cierre, previo });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const { anio, mes } = await request.json();
    if (!anio || !mes) return NextResponse.json({ error: "anio y mes requeridos" }, { status: 400 });

    const cierre = await calcularCierreTercero(tenantId, Number(anio), Number(mes));
    if (!cierre) {
      return NextResponse.json({ error: "No hay cuenta de Mercado Libre conectada" }, { status: 400 });
    }
    return NextResponse.json({ cierre });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const body = await request.json();
    const { anio, mes } = body;
    if (!anio || !mes) return NextResponse.json({ error: "anio y mes requeridos" }, { status: 400 });

    const cierre = await guardarDescuentos(tenantId, Number(anio), Number(mes), {
      publicidad: body.publicidad,
      percepciones: body.percepciones,
      iibb: body.iibb,
      monotributo: body.monotributo,
      ...("notas" in body ? { notas: body.notas } : {}),
    });
    return NextResponse.json({ cierre });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
