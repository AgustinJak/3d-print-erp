export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { prisma } from "@/lib/prisma";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { coberturaDePedidos, ESTADOS_QUE_RESERVAN, reasignarReservas } from "@/lib/reservas";
import { NextRequest, NextResponse } from "next/server";

const MESES_DEMANDA = 6;

/**
 * Stock por unidad vendible.
 *
 * Una "unidad de stock" es un modelo + las variantes que definen una pieza
 * física distinta (`VarianteModelo.afectaStock`): el tamaño de una katana o el
 * color de una bola abren fila propia; la funda **no**, porque no limita la
 * venta — se repone aparte.
 *
 * Devuelve además la demanda de los últimos meses, que es lo que permite subir
 * o bajar el mínimo con datos en vez de a ojo.
 */
export async function GET() {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();

    const desde = new Date();
    desde.setMonth(desde.getMonth() - MESES_DEMANDA);

    const [filas, items, reservas] = await Promise.all([
      prisma.stock.findMany({
        where: { tenantId },
        include: {
          modelo: {
            select: {
              id: true,
              nombre: true,
              sku: true,
              costoFab: true,
              variantes: true,
              categorias: { include: { categoria: { select: { nombre: true, color: true } } } },
              publicacionesMl: { where: { ignorar: false }, select: { mla: true } },
            },
          },
        },
      }),
      prisma.itemPedido.findMany({
        where: { pedido: { tenantId, fechaPedido: { gte: desde }, estado: { not: "CANCELADO" } } },
        select: { modeloId: true, cantidad: true, variantesInfo: true },
      }),
      // Lo que ya tiene dueño: sigue en el galpón pero no se puede prometer.
      prisma.reservaStock.groupBy({
        by: ["stockId"],
        where: { tenantId, estado: "RESERVADA" },
        _sum: { cantidad: true },
      }),
    ]);

    const reservado = new Map(reservas.map((r) => [r.stockId, r._sum.cantidad ?? 0]));

    // demanda por modelo y por variante (para repartir entre las filas)
    const demModelo = new Map<string, number>();
    const demVariante = new Map<string, number>();
    for (const it of items) {
      demModelo.set(it.modeloId, (demModelo.get(it.modeloId) ?? 0) + it.cantidad);
      const vi = Array.isArray(it.variantesInfo) ? (it.variantesInfo as Array<Record<string, unknown>>) : [];
      for (const v of vi) {
        if (!v?.matched || typeof v.varianteId !== "string") continue;
        demVariante.set(v.varianteId, (demVariante.get(v.varianteId) ?? 0) + it.cantidad);
      }
    }

    const porModelo = new Map<string, typeof filas>();
    for (const f of filas) {
      const arr = porModelo.get(f.modeloId) ?? [];
      arr.push(f);
      porModelo.set(f.modeloId, arr);
    }

    const salida = filas.map((f) => {
      const hermanas = porModelo.get(f.modeloId) ?? [f];
      const demTotal = demModelo.get(f.modeloId) ?? 0;

      // Reparte la demanda del modelo entre sus filas según lo que quedó
      // registrado en cada venta; si no hay registro, en partes iguales.
      let demanda: number;
      if (f.variantes.length === 0) {
        demanda = demTotal;
      } else {
        const registrada = hermanas.map((h) => h.variantes.reduce((a, id) => a + (demVariante.get(id) ?? 0), 0));
        const suma = registrada.reduce((a, b) => a + b, 0);
        const idx = hermanas.findIndex((h) => h.id === f.id);
        demanda = suma > 0 ? demTotal * (registrada[idx] / suma) : demTotal / hermanas.length;
      }

      const extra = f.variantes.reduce(
        (a, id) => a + (f.modelo.variantes.find((v) => v.id === id)?.costoFabAdicional ?? 0), 0);

      const res = reservado.get(f.id) ?? 0;
      const disponible = f.cantidad - res;
      // Hay que imprimir para llegar al colchón Y para cubrir lo comprometido.
      const falta = Math.max(0, f.minimo - disponible);
      return {
        id: f.id,
        etiqueta: f.etiqueta ?? f.modelo.nombre,
        modeloId: f.modeloId,
        sku: f.modelo.sku,
        categoria: f.modelo.categorias[0]?.categoria.nombre ?? null,
        categoriaColor: f.modelo.categorias[0]?.categoria.color ?? null,
        publicado: f.modelo.publicacionesMl.length > 0,
        cantidad: f.cantidad,
        reservado: res,
        disponible,
        minimo: f.minimo,
        falta,
        costoUnitario: f.modelo.costoFab + extra,
        costoFaltante: (f.modelo.costoFab + extra) * falta,
        demandaMensual: Number((demanda / MESES_DEMANDA).toFixed(1)),
        // meses que aguanta el stock actual al ritmo de venta
        cobertura: demanda > 0 ? Number((disponible / (demanda / MESES_DEMANDA)).toFixed(1)) : null,
        // se completa más abajo, cuando se sabe qué pedidos están esperando
        esperando: null as { unidades: number; pedidos: number } | null,
      };
    });

    // ── Qué pedidos están esperando cada pieza ──────────────────────────────
    // Es la razón por la que hay que imprimir hoy y no la semana que viene.
    const abiertos = await prisma.pedido.findMany({
      where: { tenantId, estado: { in: [...ESTADOS_QUE_RESERVAN] as never } },
      select: {
        id: true,
        estado: true,
        ordenProduccion: true,
        prioridad: true,
        canalVenta: true,
        fechaEntrega: true,
        fechaPedido: true,
        cliente: { select: { nombre: true } },
        items: { select: { id: true, modeloId: true, cantidad: true, variantesInfo: true } },
      },
    });
    const cobertura = await coberturaDePedidos(tenantId, abiertos);

    const esperanPorStock = new Map<string, { unidades: number; pedidos: Set<string> }>();
    const avisos: Array<{ tipo: string; etiqueta: string; pedido: string; unidades: number }> = [];

    for (const p of abiertos) {
      const cob = cobertura.get(p.id);
      if (!cob) continue;
      const quien = p.cliente?.nombre ?? "sin cliente";
      for (const comps of Object.values(cob.componentes)) {
        for (const c of comps) {
          if (c.falta === 0) continue;
          if (c.stockId) {
            const e = esperanPorStock.get(c.stockId) ?? { unidades: 0, pedidos: new Set<string>() };
            e.unidades += c.falta;
            e.pedidos.add(p.id);
            esperanPorStock.set(c.stockId, e);
          } else if (c.motivo !== "a_pedido") {
            // No hay a qué descontarle: falta la fila de stock o la receta.
            avisos.push({ tipo: c.motivo ?? "sin_fila", etiqueta: c.etiqueta, pedido: quien, unidades: c.falta });
          }
        }
      }
    }

    for (const s of salida) {
      const e = esperanPorStock.get(s.id);
      s.esperando = e ? { unidades: e.unidades, pedidos: e.pedidos.size } : null;
    }

    salida.sort(
      (a, b) =>
        (b.esperando?.unidades ?? 0) - (a.esperando?.unidades ?? 0) ||
        b.falta - a.falta ||
        b.demandaMensual - a.demandaMensual
    );

    const aProducir = salida.filter((s) => s.falta > 0);
    const pedidosEsperando = new Set(
      abiertos.filter((p) => (cobertura.get(p.id)?.falta ?? 0) > 0).map((p) => p.id)
    );

    return NextResponse.json({
      stock: salida,
      avisos,
      resumen: {
        unidadesDeStock: salida.length,
        conObjetivo: salida.filter((s) => s.minimo > 0).length,
        enCero: salida.filter((s) => s.minimo > 0 && s.disponible <= 0).length,
        unidadesAProducir: aProducir.reduce((a, s) => a + s.falta, 0),
        costoAProducir: aProducir.reduce((a, s) => a + s.costoFaltante, 0),
        unidadesEnStock: salida.reduce((a, s) => a + s.cantidad, 0),
        unidadesReservadas: salida.reduce((a, s) => a + s.reservado, 0),
        comprometidoSinStock: salida.filter((s) => s.disponible < 0).length,
        pedidosEsperando: pedidosEsperando.size,
        unidadesEsperadas: [...esperanPorStock.values()].reduce((a, e) => a + e.unidades, 0),
      },
    });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * PATCH — ajusta una unidad de stock.
 *
 * Body: { id, cantidad?, minimo?, delta?, motivo?, nota? }
 *
 * `cantidad` fija el valor (conteo físico), `delta` suma o resta. Cualquier
 * cambio de cantidad deja su movimiento, para poder auditar después por qué
 * quedó donde quedó.
 */
export async function PATCH(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const body = await request.json();
    const id: string | undefined = body.id;
    if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

    const actual = await prisma.stock.findFirst({ where: { id, tenantId } });
    if (!actual) return NextResponse.json({ error: "no encontrado" }, { status: 404 });

    const data: { cantidad?: number; minimo?: number } = {};
    let delta = 0;

    if (typeof body.delta === "number" && body.delta !== 0) {
      delta = Math.round(body.delta);
      // Sin clampear en 0, igual que el RPC `bodega_mover_stock`: un negativo
      // significa que se vendió algo que no estaba registrado y conviene que se
      // vea. Además mantiene `cantidad = suma de los deltas`, reconciliable
      // contra `movimientos_stock`.
      data.cantidad = actual.cantidad + delta;
    } else if (typeof body.cantidad === "number") {
      // El conteo físico sí se clampea: no se pueden contar unidades negativas.
      const nueva = Math.max(0, Math.round(body.cantidad));
      delta = nueva - actual.cantidad;
      data.cantidad = nueva;
    }
    if (typeof body.minimo === "number") data.minimo = Math.max(0, Math.round(body.minimo));

    const actualizado = await prisma.$transaction(async (tx) => {
      const r = await tx.stock.update({ where: { id }, data });
      if (delta !== 0) {
        await tx.movimientoStock.create({
          data: {
            stockId: id,
            delta,
            motivo: body.motivo ?? (typeof body.cantidad === "number" ? "conteo" : "ajuste"),
            nota: body.nota ?? null,
          },
        });
      }
      return r;
    });

    // Cambió la pila: hay que repartirla de nuevo entre los pedidos abiertos.
    //
    // Si el reparto falla, el conteo YA quedó guardado y no se pierde: se avisa
    // y listo. El próximo reparto (otro ajuste, un pedido nuevo, el cron)
    // corrige todo, porque se recalcula entero cada vez.
    let reparto = null;
    let repartoError: string | null = null;
    try {
      reparto = await reasignarReservas(tenantId);
    } catch (err) {
      repartoError = err instanceof Error ? err.message : "error";
      console.error("[api/stock] no se pudo repartir el stock:", err);
    }

    return NextResponse.json({ ok: true, stock: actualizado, reparto, repartoError });
  } catch (e) {
    if (e instanceof NextResponse) return e;
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
