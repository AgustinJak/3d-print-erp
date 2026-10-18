/**
 * docs/sdd/001, spec 006 — revisar las recetas desde la terminal. Sólo lee.
 *
 *   npx tsx --env-file=.env scripts/sdd-001-recetas.ts [filtro de nombre]
 *
 * Lista los insumos disponibles, lo que consume cada combinación que coincide con
 * el filtro, y las combinaciones "Con <accesorio>" que todavía no tienen insumo.
 */
import { prisma } from "@/lib/prisma";
import { insumosDisponibles, recetaDeCombinacion } from "@/lib/recetas";

const TENANT = "sendero3d";
const filtro = process.argv[2] ?? "";

async function main() {
  const insumos = await insumosDisponibles(TENANT);
  console.log(`Insumos: ${insumos.length}`);
  for (const i of insumos) console.log(`  ${i.etiqueta} — stock ${i.cantidad}${i.costo != null ? ` — $${Math.round(i.costo)}` : " — sin costo de Bodega"}`);

  const combos = await prisma.combinacion.findMany({
    where: { tenantId: TENANT, activo: true, ...(filtro ? { nombre: { contains: filtro, mode: "insensitive" } } : {}) },
    select: { id: true },
    orderBy: { nombre: "asc" },
  });
  const pendientes: string[] = [];
  for (const { id } of combos) {
    const r = (await recetaDeCombinacion(TENANT, id))!;
    if (r.pendiente) pendientes.push(r.combinacion.nombre);
    if (filtro) {
      const partes = r.componentes.map((c) => `${c.tipo === "insumo" ? "+ " : ""}${c.etiqueta}${c.stockId ? "" : ` (${c.motivo})`}`);
      console.log(`\n${r.combinacion.sku ?? "(sin SKU)"}  ${r.combinacion.nombre}\n   consume: ${partes.join(" ")}`);
    }
  }
  console.log(`\nCombinaciones "Con …" sin insumo (pendientes): ${pendientes.length}`);
  for (const p of pendientes) console.log(`  ${p}`);
}

main().finally(() => prisma.$disconnect());
