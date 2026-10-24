import { prisma } from "@/lib/prisma";
import { asegurarCombinacion } from "@/lib/combinaciones";
import { costosPorFilaDeStock } from "@/lib/costos-bodega";
import { cargarContexto, componentesDeItem, reasignarReservas, type Componente } from "@/lib/reservas";

/**
 * Recetas desde el ERP (docs/sdd/001, spec 006).
 *
 * Qué funda lleva cada katana vivía en `reglas_insumo`, una tabla sin pantalla:
 * las 33 recetas se cargaron con scripts, y crear una katana nueva pedía ayuda
 * para mapear la funda. Esto la arma por combinación.
 *
 * La receta se sigue guardando en `reglas_insumo`, con `requiere` = las
 * variantes de la combinación: es exactamente la regla que el reparto ya sabe
 * aplicar (`componentesDeItem`), así que el reparto no cambia.
 */

const mismoConjunto = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

export interface Insumo {
  stockId: string;
  etiqueta: string;
  modelo: string;
  modeloId: string;
  cantidad: number;
  /** Costo de Bodega de la pieza, si lo tiene. */
  costo: number | null;
  /** Los productos cuyas recetas lo consumen (docs/sdd/004, spec 006). */
  usadoPor: Array<{ id: string; nombre: string }>;
}

/**
 * Lo que se puede poner en una receta: las filas de stock de los insumos (`esInsumo`, docs/sdd/004
 * spec 006) y, mientras el relleno no corra, de los modelos de la categoría Insumos. Las fundas son
 * modelos inactivos a propósito, para no figurar como productos (SDD 001, spec 006, RN-1).
 */
export async function insumosDisponibles(tenantId: string): Promise<Insumo[]> {
  const filas = await prisma.stock.findMany({
    where: {
      tenantId,
      modelo: {
        OR: [
          { esInsumo: true },
          { categorias: { some: { categoria: { nombre: { startsWith: "Insumo", mode: "insensitive" } } } } },
        ],
      },
    },
    select: {
      id: true,
      etiqueta: true,
      cantidad: true,
      modelo: { select: { id: true, nombre: true } },
      reglasInsumo: { select: { modelo: { select: { id: true, nombre: true, activo: true } } } },
    },
    orderBy: { etiqueta: "asc" },
  });
  const costos = await costosPorFilaDeStock(tenantId);
  return filas.map((f) => {
    const c = costos.get(f.id);
    // Un producto con varias reglas sobre el mismo insumo cuenta una vez; los inactivos no.
    const usadoPor = new Map(f.reglasInsumo.filter((r) => r.modelo.activo).map((r) => [r.modelo.id, r.modelo.nombre]));
    return {
      stockId: f.id,
      etiqueta: f.etiqueta ?? f.modelo.nombre,
      modelo: f.modelo.nombre,
      modeloId: f.modelo.id,
      cantidad: f.cantidad,
      costo: c ? c.fab + c.insumos : null,
      usadoPor: [...usadoPor].map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    };
  });
}

/**
 * Todas las recetas que usan un insumo pasan a otro (docs/sdd/004, spec 006, RN-2): cambiar la
 * funda blanca por otra en todas las katanas que la llevan, de una vez. Reparte al final.
 */
export async function reemplazarInsumo(tenantId: string, deStockId: string, aStockId: string): Promise<{ recetas: number }> {
  if (deStockId === aStockId) throw new Error("es el mismo insumo");
  const validos = new Set((await insumosDisponibles(tenantId)).map((i) => i.stockId));
  if (!validos.has(deStockId) || !validos.has(aStockId)) throw new Error("los dos tienen que ser insumos");
  const r = await prisma.reglaInsumo.updateMany({ where: { tenantId, stockId: deStockId }, data: { stockId: aStockId } });
  await reasignarReservas(tenantId);
  return { recetas: r.count };
}

export interface RecetaDeCombinacion {
  combinacion: { id: string; nombre: string; sku: string | null; modeloId: string; variantes: string[] };
  /** Lo que reserva una unidad: la pieza y los insumos, como lo calcula el reparto. */
  componentes: Componente[];
  /** Las reglas de esta combinación exacta: las que se editan acá. */
  propias: Array<{ stockId: string; cantidad: number }>;
  /** Reglas del modelo que también aplican pero no son sólo de esta combinación. */
  heredadas: number;
  /** Lleva un "Con <accesorio>" y ningún insumo: pendiente (spec 006, REQ-4). */
  pendiente: boolean;
}

export async function recetaDeCombinacion(tenantId: string, combinacionId: string): Promise<RecetaDeCombinacion | null> {
  const c = await prisma.combinacion.findFirst({
    where: { id: combinacionId, tenantId },
    select: { id: true, nombre: true, sku: true, modeloId: true, variantes: true },
  });
  if (!c) return null;

  const [ctx, reglas, variantes] = await Promise.all([
    cargarContexto(prisma, tenantId),
    prisma.reglaInsumo.findMany({ where: { tenantId, modeloId: c.modeloId }, select: { requiere: true, stockId: true, cantidad: true } }),
    prisma.varianteModelo.findMany({ where: { id: { in: c.variantes } }, select: { nombre: true } }),
  ]);
  const componentes = componentesDeItem(
    { modeloId: c.modeloId, cantidad: 1, variantesInfo: null, combinacion: { modeloId: c.modeloId, variantes: c.variantes } },
    ctx,
    "combinacion"
  );
  const aplican = reglas.filter((r) => r.requiere.every((v) => c.variantes.includes(v)));
  const propias = aplican.filter((r) => mismoConjunto(r.requiere, c.variantes));
  const conAccesorio = variantes.some((v) => /^\s*con\s+/i.test(v.nombre));
  return {
    combinacion: c,
    componentes,
    propias: propias.map((r) => ({ stockId: r.stockId, cantidad: r.cantidad })),
    heredadas: aplican.length - propias.length,
    pendiente: conAccesorio && !componentes.some((x) => x.tipo === "insumo" && x.stockId),
  };
}

/**
 * Reemplaza los insumos de una combinación y vuelve a repartir el stock, para que
 * los pedidos abiertos reserven lo nuevo (spec 006, REQ-2 y REQ-5).
 *
 * Si la combinación es "Con <accesorio>" (una sola variante que no parte el
 * stock), el adicional de costo de esa variante pasa a ser el costo de Bodega de
 * sus insumos, como lo calcula `planDeCostos` (spec 006, RN-4).
 */
export async function guardarReceta(
  tenantId: string,
  combinacionId: string,
  insumos: Array<{ stockId: string; cantidad: number }>
): Promise<{ costoAdicional: number | null }> {
  const c = await prisma.combinacion.findFirst({ where: { id: combinacionId, tenantId } });
  if (!c) throw new Error("combinación no encontrada");

  const validos = new Map((await insumosDisponibles(tenantId)).map((i) => [i.stockId, i]));
  for (const i of insumos) {
    if (!validos.has(i.stockId)) throw new Error("eso no es un insumo: tiene que ser una fila de un modelo de la categoría Insumos");
    if (!Number.isInteger(i.cantidad) || i.cantidad < 1) throw new Error("la cantidad tiene que ser un entero desde 1");
  }

  await prisma.$transaction(async (tx) => {
    const delModelo = await tx.reglaInsumo.findMany({ where: { tenantId, modeloId: c.modeloId }, select: { id: true, requiere: true } });
    const propias = delModelo.filter((r) => mismoConjunto(r.requiere, c.variantes)).map((r) => r.id);
    if (propias.length) await tx.reglaInsumo.deleteMany({ where: { id: { in: propias } } });
    if (insumos.length) {
      await tx.reglaInsumo.createMany({
        data: insumos.map((i) => ({ tenantId, modeloId: c.modeloId, requiere: [...c.variantes].sort(), stockId: i.stockId, cantidad: i.cantidad })),
      });
    }
  });

  // El adicional de "Con <accesorio>": sólo si la combinación es esa variante sola.
  let costoAdicional: number | null = null;
  if (c.variantes.length === 1) {
    const v = await prisma.varianteModelo.findUnique({ where: { id: c.variantes[0] }, select: { id: true, afectaStock: true } });
    if (v && !v.afectaStock) {
      const costos = await costosPorFilaDeStock(tenantId);
      const conCosto = insumos.map((i) => ({ i, c: costos.get(i.stockId) }));
      if (conCosto.every((x) => x.c)) {
        const fab = conCosto.reduce((a, x) => a + x.c!.fab * x.i.cantidad, 0);
        const ins = conCosto.reduce((a, x) => a + x.c!.insumos * x.i.cantidad, 0);
        await prisma.varianteModelo.update({
          where: { id: v.id },
          data: { costoFabAdicional: Math.round(fab), costoInsumosAdicional: Math.round(ins) },
        });
        costoAdicional = Math.round(fab + ins);
      }
    }
  }

  await reasignarReservas(tenantId);
  return { costoAdicional };
}

/**
 * "Agregar accesorio" (spec 006, REQ-3): crea "Con <nombre>" y "Sin <nombre>" si
 * no están, sus combinaciones, y la receta de "Con" si viene el insumo.
 *
 * La combinación del modelo solo (sin variantes) se desactiva: desde ahora cada
 * venta dice con o sin, y dejarla activa sería una tercera opción ambigua para
 * el mapeo. Se puede volver a activar.
 */
export async function agregarAccesorio(
  tenantId: string,
  modeloId: string,
  nombre: string,
  stockId?: string | null
): Promise<{ con: string; sin: string }> {
  const accesorio = nombre.trim().replace(/^(con|sin)\s+/i, "");
  if (!accesorio) throw new Error("falta el nombre del accesorio");
  const titulo = accesorio[0].toUpperCase() + accesorio.slice(1);

  const modelo = await prisma.modelo.findFirst({
    where: { id: modeloId, tenantId },
    select: { id: true, variantes: { select: { id: true, nombre: true } } },
  });
  if (!modelo) throw new Error("modelo no encontrado");

  const buscar = (pref: string) =>
    modelo.variantes.find((v) => v.nombre.trim().toLowerCase() === `${pref} ${accesorio}`.toLowerCase());
  // El par es un grupo de tipo insumo con el nombre del accesorio (docs/sdd/004, spec 003).
  const asegurarVariante = async (pref: "Con" | "Sin") => {
    const ya = buscar(pref);
    if (ya) {
      await prisma.varianteModelo.update({ where: { id: ya.id }, data: { grupo: titulo, tipo: "insumo" } });
      return ya.id;
    }
    return (
      await prisma.varianteModelo.create({
        data: { modeloId, nombre: `${pref} ${titulo}`, precioAdicional: 0, costoFabAdicional: 0, afectaStock: false, grupo: titulo, tipo: "insumo" },
      })
    ).id;
  };

  const conId = await asegurarVariante("Con");
  const sinId = await asegurarVariante("Sin");
  const con = await asegurarCombinacion(prisma, tenantId, modeloId, [conId]);
  const sin = await asegurarCombinacion(prisma, tenantId, modeloId, [sinId]);
  await prisma.combinacion.updateMany({ where: { tenantId, modeloId, variantes: { isEmpty: true } }, data: { activo: false } });

  if (stockId) await guardarReceta(tenantId, con.id, [{ stockId, cantidad: 1 }]);
  return { con: con.id, sin: sin.id };
}
