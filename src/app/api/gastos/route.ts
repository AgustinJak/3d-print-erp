export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenant } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

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
      where.billetera = billetera;
    }

    const gastos = await prisma.gasto.findMany({
      where,
      orderBy: { fecha: "desc" },
    });
    return NextResponse.json(gastos);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}

/**
 * Crea un gasto único o N cuotas si se pasa el flag `cuotas`.
 *
 * Body:
 *  {
 *    fecha?: string,
 *    categoria: string,
 *    monto: number,        // monto TOTAL si hay cuotas, monto único si no
 *    descripcion?: string,
 *    billetera?: "fabricacion" | "empresarial",   // default fabricacion
 *    cuotas?: {
 *      cantidad: number,         // N cuotas
 *      fechaPrimera?: string,    // default = hoy
 *    }
 *  }
 */
export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenant();
    const body = await request.json();

    // Para fechas "YYYY-MM-DD" agregamos T12:00:00 para evitar el shift de UTC.
    // En AR (UTC-3) un date input sin hora se interpreta como UTC midnight y
    // retrocede 3hs al día anterior.
    const parseFechaLocal = (s: string | undefined) => {
      if (!s) return new Date();
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + "T12:00:00");
      return new Date(s);
    };
    const fecha = parseFechaLocal(body.fecha);
    const categoria = body.categoria;
    const monto = parseFloat(body.monto);
    const descripcion = body.descripcion || null;
    const billetera = body.billetera === "empresarial" ? "empresarial" : "fabricacion";

    if (Number.isNaN(monto) || monto <= 0) {
      return NextResponse.json({ error: "monto inválido" }, { status: 400 });
    }
    if (!categoria) {
      return NextResponse.json({ error: "categoría requerida" }, { status: 400 });
    }

    // ─── Modo cuotas ─────────────────────────────────────
    if (body.cuotas && typeof body.cuotas === "object") {
      const cantidad = parseInt(body.cuotas.cantidad, 10);
      if (!Number.isFinite(cantidad) || cantidad < 2 || cantidad > 60) {
        return NextResponse.json(
          { error: "Cantidad de cuotas debe estar entre 2 y 60" },
          { status: 400 }
        );
      }
      const fechaPrimera = body.cuotas.fechaPrimera
        ? parseFechaLocal(body.cuotas.fechaPrimera)
        : fecha;
      const grupoCuotasId = randomUUID();
      const montoPorCuota = Math.round((monto / cantidad) * 100) / 100;

      const data = Array.from({ length: cantidad }).map((_, i) => {
        const fechaCuota = new Date(fechaPrimera);
        fechaCuota.setMonth(fechaCuota.getMonth() + i);
        return {
          fecha: fechaCuota,
          categoria,
          monto: montoPorCuota,
          descripcion: descripcion
            ? `${descripcion} (Cuota ${i + 1}/${cantidad})`
            : `Cuota ${i + 1}/${cantidad}`,
          billetera,
          grupoCuotasId,
          cuotaNumero: i + 1,
          cuotaTotal: cantidad,
          tenantId,
        };
      });

      await prisma.gasto.createMany({ data });

      // Devolver todas las cuotas creadas
      const cuotas = await prisma.gasto.findMany({
        where: { tenantId, grupoCuotasId },
        orderBy: { cuotaNumero: "asc" },
      });
      return NextResponse.json(
        { grupoCuotasId, cuotas, total: monto, cantidad },
        { status: 201 }
      );
    }

    // ─── Modo gasto único ─────────────────────────────────
    const gasto = await prisma.gasto.create({
      data: {
        fecha,
        categoria,
        monto,
        descripcion,
        billetera,
        tenantId,
      },
    });
    return NextResponse.json(gasto, { status: 201 });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    throw e;
  }
}
