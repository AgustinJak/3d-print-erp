export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import {
  calcularCierreTercero,
  compartidosPrevios,
  guardarCompartidos,
  leerCierreTercero,
} from "@/lib/ventas-terceros";
import { NextRequest, NextResponse } from "next/server";

/**
 * Reparto de la cuenta de Mercado Libre compartida con Shay Juguetes.
 *
 * GET   → el cierre guardado del mes (rápido, no llama a ML). `null` si nunca
 *         se calculó: la UI ofrece el botón. Trae también los gastos del último
 *         mes cargado, como propuesta.
 * POST  → recalcula las ventas desde ML y las guarda. Tarda unos segundos.
 * PATCH → guarda los gastos compartidos del mes (percepciones, convenio,
 *         monotributo) con su TOTAL. El reparto entre las dos tiendas se
 *         recalcula solo, según cuánto vendió cada una.
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
      compartidosPrevios(tenantId, anio, mes),
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

    await guardarCompartidos(tenantId, Number(anio), Number(mes), {
      percepciones: body.percepciones,
      iibb: body.iibb,
      monotributo: body.monotributo,
      ...("notas" in body ? { notas: body.notas } : {}),
    });

    return NextResponse.json({ cierre: await leerCierreTercero(tenantId, Number(anio), Number(mes)) });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
