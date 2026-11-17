/**
 * docs/sdd/014 — la lista de piezas a completar, contra la base real (sólo lee).
 *
 *   npx tsx --env-file=.env --env-file=.env.local --tsconfig tsconfig.json scripts/sdd-014-probar-piezas.ts
 */
import { prisma } from "@/lib/prisma";
import { piezasACompletar } from "@/lib/piezas-a-completar";

async function main() {
  const t = Date.now();
  const l = await piezasACompletar("sendero3d");
  console.log(`${l.length} piezas en ${Date.now() - t} ms`);
  console.log(`sin receta: ${l.filter((p) => !p.tieneReceta).length} · sin archivo: ${l.filter((p) => !p.tieneArchivo).length} · completas: ${l.filter((p) => p.tieneReceta && p.tieneArchivo).length}`);
  console.log("demo:", (await piezasACompletar("demo")).length);
  console.log("\nlas 12 que más se vendieron (90 días):");
  for (const p of l.slice(0, 12))
    console.log(`  ${String(p.vendidas).padStart(4)}  ${p.etiqueta ?? p.nombre}${p.esInsumo ? " (insumo)" : ""}  ${p.tieneReceta ? "" : "· sin receta"} ${p.tieneArchivo ? "" : "· sin archivo"}`);
  const insumos = l.filter((p) => p.esInsumo).slice(0, 4);
  console.log("\ninsumos:", insumos.map((p) => `${p.etiqueta ?? p.nombre} ${p.vendidas}`).join(" | "));
}
main().finally(() => prisma.$disconnect());
