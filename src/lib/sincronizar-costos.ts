import { prisma } from "@/lib/prisma";
import { costosPorFilaDeStock, type CostoDeFila } from "@/lib/costos-bodega";

/**
 * Baja a los costos del ERP lo que Bodega sabe de cada pieza.
 *
 * El ERP guarda el costo como base del modelo más un adicional por variante
 * (`costoFab` + `costoFabAdicional`), mientras que Bodega tiene un modelo
 * separado por cada pieza física. Traducir de un lado al otro es restar: la base
 * es la fila más barata y cada variante vale la diferencia hasta la suya.
 *
 * Los insumos de la funda son el caso interesante. Hoy el costo de la funda está
 * escrito en dos lugares —el adicional de la variante "Con Funda" y el costo del
 * modelo Funda— y coinciden sólo porque se cargaron juntos. Acá los dos salen
 * del mismo modelo de Bodega, así que no pueden separarse: el adicional se lee
 * de la receta de insumo, que es la que dice qué funda consume.
 *
 * Regla de oro: no escribir lo que no se puede explicar. Si a una fila le falta
 * la receta, o una variante tiene un costo que no sale de ninguna parte, el
 * modelo entero queda afuera y se informa. Un costo a medias es peor que uno
 * viejo, porque parece actualizado.
 */

export interface CambioCosto {
  modeloId: string;
  modelo: string;
  antes: { fab: number; insumos: number };
  despues: { fab: number; insumos: number };
  variantes: Array<{
    varianteId: string;
    nombre: string;
    antes: { fab: number; insumos: number };
    despues: { fab: number; insumos: number };
    origen: string;
  }>;
  /** El costo de una unidad sin variantes adicionales, antes y después. */
  totalAntes: number;
  totalDespues: number;
}

export interface ModeloSaltado {
  modeloId: string;
  modelo: string;
  motivo: string;
}

export interface PlanDeCostos {
  cambios: CambioCosto[];
  saltados: ModeloSaltado[];
  sinCambio: number;
}

const suma = (c: { fab: number; insumos: number }) => c.fab + c.insumos;
const redondear = (n: number) => Math.round(n);

export async function planDeCostos(tenantId: string): Promise<PlanDeCostos> {
  const costos = await costosPorFilaDeStock(tenantId);

  const modelos = await prisma.modelo.findMany({
    where: { tenantId },
    select: {
      id: true,
      nombre: true,
      costoFab: true,
      costoInsumos: true,
      variantes: {
        select: { id: true, nombre: true, afectaStock: true, costoFabAdicional: true, costoInsumosAdicional: true },
      },
    },
    orderBy: { nombre: "asc" },
  });

  const filas = await prisma.stock.findMany({
    where: { tenantId },
    select: { id: true, modeloId: true, variantes: true, etiqueta: true },
  });
  const filasPorModelo = new Map<string, typeof filas>();
  for (const f of filas) {
    const a = filasPorModelo.get(f.modeloId) ?? [];
    a.push(f);
    filasPorModelo.set(f.modeloId, a);
  }

  const reglas = await prisma.reglaInsumo.findMany({
    where: { tenantId },
    select: { modeloId: true, requiere: true, stockId: true, cantidad: true },
  });
  const reglasPorModelo = new Map<string, typeof reglas>();
  for (const r of reglas) {
    const a = reglasPorModelo.get(r.modeloId) ?? [];
    a.push(r);
    reglasPorModelo.set(r.modeloId, a);
  }

  const cambios: CambioCosto[] = [];
  const saltados: ModeloSaltado[] = [];
  let sinCambio = 0;

  for (const m of modelos) {
    const misFilas = filasPorModelo.get(m.id) ?? [];
    if (misFilas.length === 0) {
      saltados.push({ modeloId: m.id, modelo: m.nombre, motivo: "no tiene filas de stock" });
      continue;
    }

    const conCosto = misFilas.map((f) => ({ f, c: costos.get(f.id) }));
    const sinReceta = conCosto.filter((x) => !x.c);
    if (sinReceta.length > 0) {
      saltados.push({
        modeloId: m.id,
        modelo: m.nombre,
        motivo:
          sinReceta.length === misFilas.length
            ? "Bodega no tiene la receta de ninguna de sus piezas"
            : `Bodega no tiene la receta de: ${sinReceta.map((x) => x.f.etiqueta ?? "?").join(", ")}`,
      });
      continue;
    }

    const varsQuePartenStock = new Set(m.variantes.filter((v) => v.afectaStock).map((v) => v.id));
    // Si una fila combina dos variantes de stock (color × tamaño), la base y el
    // adicional dejan de estar definidos: no hay forma de repartir la diferencia
    // entre las dos sin inventar. Mejor no tocarlo.
    const combinada = misFilas.find((f) => f.variantes.filter((id) => varsQuePartenStock.has(id)).length > 1);
    if (combinada) {
      saltados.push({
        modeloId: m.id,
        modelo: m.nombre,
        motivo: `"${combinada.etiqueta}" combina más de una variante de stock: el adicional no es una resta`,
      });
      continue;
    }

    // La base es la fila más barata: así ningún adicional queda negativo.
    const ordenadas = [...conCosto].sort((a, b) => {
      const va = a.f.variantes.filter((id) => varsQuePartenStock.has(id)).length;
      const vb = b.f.variantes.filter((id) => varsQuePartenStock.has(id)).length;
      return va - vb || a.c!.total - b.c!.total;
    });
    const base = ordenadas[0].c as CostoDeFila;

    const nuevasVariantes: CambioCosto["variantes"] = [];
    let incompleto: string | null = null;

    for (const v of m.variantes) {
      let despues: { fab: number; insumos: number } | null = null;
      let origen = "";

      if (v.afectaStock) {
        const fila = conCosto.find((x) => x.f.variantes.includes(v.id));
        if (!fila) {
          // Variante declarada sin fila de stock: no hay pieza que costear.
          despues = { fab: 0, insumos: 0 };
          origen = "sin fila de stock";
        } else {
          despues = { fab: fila.c!.fab - base.fab, insumos: fila.c!.insumos - base.insumos };
          // Cuando la fila ES la base, restar contra sí misma da cero y el
          // origen quedaba como "X − X", que no explica nada.
          origen =
            fila.c!.stockId === base.stockId
              ? "es la pieza base"
              : `${fila.c!.receta.nombre} − ${base.receta.nombre}`;
        }
      } else {
        const suyas = (reglasPorModelo.get(m.id) ?? []).filter((r) => r.requiere.includes(v.id));
        if (suyas.length > 0) {
          let fab = 0;
          let ins = 0;
          const partes: string[] = [];
          for (const r of suyas) {
            const c = costos.get(r.stockId);
            if (!c) {
              incompleto = `la receta de insumo de "${v.nombre}" apunta a una pieza que Bodega no costeó`;
              break;
            }
            fab += c.fab * r.cantidad;
            ins += c.insumos * r.cantidad;
            partes.push(`${r.cantidad}× ${c.receta.nombre}`);
          }
          if (incompleto) break;
          despues = { fab, insumos: ins };
          origen = partes.join(" + ");
        } else if (v.costoFabAdicional === 0 && v.costoInsumosAdicional === 0) {
          despues = { fab: 0, insumos: 0 };
          origen = "sin costo propio";
        } else {
          // Tiene un adicional cargado a mano y ninguna regla que lo explique.
          // No se toca: puede ser pintura, packaging, algo que Bodega no sabe.
          incompleto = `"${v.nombre}" tiene un costo adicional que no sale de ninguna receta`;
          break;
        }
      }

      nuevasVariantes.push({
        varianteId: v.id,
        nombre: v.nombre,
        antes: { fab: v.costoFabAdicional, insumos: v.costoInsumosAdicional },
        despues: { fab: redondear(despues!.fab), insumos: redondear(despues!.insumos) },
        origen,
      });
    }

    if (incompleto) {
      saltados.push({ modeloId: m.id, modelo: m.nombre, motivo: incompleto });
      continue;
    }

    const antes = { fab: m.costoFab, insumos: m.costoInsumos };
    const despues = { fab: redondear(base.fab), insumos: redondear(base.insumos) };

    const cambioBase = antes.fab !== despues.fab || antes.insumos !== despues.insumos;
    const cambioVar = nuevasVariantes.some(
      (v) => v.antes.fab !== v.despues.fab || v.antes.insumos !== v.despues.insumos
    );
    if (!cambioBase && !cambioVar) {
      sinCambio++;
      continue;
    }

    cambios.push({
      modeloId: m.id,
      modelo: m.nombre,
      antes,
      despues,
      variantes: nuevasVariantes,
      totalAntes: suma(antes),
      totalDespues: suma(despues),
    });
  }

  return { cambios, saltados, sinCambio };
}

/**
 * Escribe el plan, salvo los modelos que se pidan dejar afuera.
 *
 * La exclusión existe porque siempre hay alguno cuyo dato en Bodega está viejo y
 * conviene arreglar allá antes de bajarlo: una katana costeada antes de que se
 * midieran los insumos figura más barata de lo que es, y aplicarla sin mirar
 * haría ver margen donde no hay.
 */
export async function aplicarPlanDeCostos(
  plan: PlanDeCostos,
  opts: { excluir?: string[] } = {}
): Promise<{ modelos: number; variantes: number; excluidos: number }> {
  const fuera = new Set(opts.excluir ?? []);
  const aEscribir = plan.cambios.filter((c) => !fuera.has(c.modeloId) && !fuera.has(c.modelo));
  let variantes = 0;
  for (const c of aEscribir) {
    await prisma.$transaction(async (tx) => {
      await tx.modelo.update({
        where: { id: c.modeloId },
        data: { costoFab: c.despues.fab, costoInsumos: c.despues.insumos },
      });
      for (const v of c.variantes) {
        if (v.antes.fab === v.despues.fab && v.antes.insumos === v.despues.insumos) continue;
        await tx.varianteModelo.update({
          where: { id: v.varianteId },
          data: { costoFabAdicional: v.despues.fab, costoInsumosAdicional: v.despues.insumos },
        });
        variantes++;
      }
    });
  }
  return { modelos: aEscribir.length, variantes, excluidos: plan.cambios.length - aEscribir.length };
}
