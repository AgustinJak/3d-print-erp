export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

const BILLETERAS_VALIDAS = new Set(["fabricacion", "empresarial", "externo"]);

/**
 * GET /api/transferencias?mes=&anio=&billetera=
 *
 * Lista de movimientos. Filtros opcionales por mes/año y por billetera
 * (devuelve los que tocan esa billetera, sea como origen o destino).
 */
export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const { searchParams } = new URL(request.url);
    const mes = searchParams.get("mes");
    const anio = searchParams.get("anio");
    const billetera = searchParams.get("billetera");

    let where: Record<string, unknown> = { tenantId };
    if (mes && anio) {
      const inicio = new Date(parseInt(anio), parseInt(mes) - 1, 1);
      const fin = new Date(parseInt(anio), parseInt(mes), 1);
      where = { tenantId, fecha: { gte: inicio, lt: fin } };
    } else if (anio) {
      const inicio = new Date(parseInt(anio), 0, 1);
      const fin = new Date(parseInt(anio) + 1, 0, 1);
      where = { tenantId, fecha: { gte: inicio, lt: fin } };
    }
    if (billetera && billetera !== "todas") {
      where.OR = [{ desde: billetera }, { hacia: billetera }];
    }

    const transferencias = await prisma.transferencia.findMany({
      where,
      orderBy: { fecha: "desc" },
    });
    return NextResponse.json(transferencias);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}

/**
 * POST /api/transferencias
 *
 * Body: { monto, desde, hacia, descripcion?, fecha? }
 *
 * Tipos de movimiento posibles:
 *  - "fabricacion" ↔ "empresarial" (transferencia entre billeteras)
 *  - "externo" → "empresarial" (aporte manual del dueño)
 *  - "empresarial" → "externo" (retiro del socio / dividendo)
 *  - "externo" → "fabricacion" (aporte manual a fabricación, raro)
 */
export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const body = await request.json();

    const monto = parseFloat(body.monto);
    if (Number.isNaN(monto) || monto <= 0) {
      return NextResponse.json({ error: "monto inválido" }, { status: 400 });
    }

    const desde = String(body.desde);
    const hacia = String(body.hacia);
    if (!BILLETERAS_VALIDAS.has(desde) || !BILLETERAS_VALIDAS.has(hacia)) {
      return NextResponse.json({ error: "billetera inválida" }, { status: 400 });
    }
    if (desde === hacia) {
      return NextResponse.json({ error: "origen y destino no pueden ser iguales" }, { status: 400 });
    }

    const parseFechaLocal = (s: string | undefined) => {
      if (!s) return new Date();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + "T12:00:00");
      return new Date(s);
    };

    const transferencia = await prisma.transferencia.create({
      data: {
        monto,
        desde,
        hacia,
        fecha: parseFechaLocal(body.fecha),
        descripcion: body.descripcion || null,
        tenantId,
      },
    });
    return NextResponse.json(transferencia, { status: 201 });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
