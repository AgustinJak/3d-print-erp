import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma";

/**
 * Se asegura de que un modelo tenga sus filas de stock.
 *
 * Una fila por combinación de variantes que definen una pieza física distinta
 * (`afectaStock`); si no tiene ninguna, una sola fila.
 *
 * Existe porque las filas se sembraron mirando las ventas de los últimos 6
 * meses, y eso dejaba afuera a los modelos nuevos: quedaban publicados pero
 * invisibles en /stock, sin poder contarlos ni reservarlos. Un modelo activo
 * tiene que estar en la lista aunque todavía no haya vendido nada.
 *
 * Es idempotente: no pisa cantidades ni objetivos de las filas que ya existen.
 */
export async function asegurarFilasDeStock(tenantId: string, modeloId: string): Promise<number> {
  const modelo = await prisma.modelo.findFirst({
    where: { id: modeloId, tenantId },
    include: { variantes: true, stock: true },
  });
  if (!modelo || !modelo.activo || modelo.consolidadoEnId) return 0;

  const queAfectan = modelo.variantes.filter((v) => v.afectaStock && v.activo);
  const combinaciones: Array<{ variantes: string[]; etiqueta: string }> =
    queAfectan.length === 0
      ? [{ variantes: [], etiqueta: modelo.nombre }]
      : queAfectan.map((v) => ({ variantes: [v.id], etiqueta: `${modelo.nombre} · ${v.nombre}` }));

  const existentes = new Set(modelo.stock.map((s) => s.clave));
  const nuevas: Prisma.StockCreateManyInput[] = [];

  for (const c of combinaciones) {
    const clave = `${modelo.id}|${[...c.variantes].sort().join(",")}`;
    if (existentes.has(clave)) continue;
    // Objetivo en 0: el colchón lo decide el usuario mirando la demanda, no un
    // número inventado al crear el modelo.
    nuevas.push({ tenantId, modeloId: modelo.id, variantes: c.variantes, clave, etiqueta: c.etiqueta, cantidad: 0, minimo: 0 });
  }

  if (nuevas.length > 0) await prisma.stock.createMany({ data: nuevas, skipDuplicates: true });
  return nuevas.length;
}
