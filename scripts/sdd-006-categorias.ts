/**
 * docs/sdd/006, TASK-007 — la categoría de ML de los productos sin publicar.
 *
 *   npx tsx --env-file=.env scripts/sdd-006-categorias.ts            (modo de prueba)
 *   npx tsx --env-file=.env scripts/sdd-006-categorias.ts --aplicar
 *
 * La heredada de los productos publicados de su categoría del ERP; si no hay, la del predictor de
 * ML. No toca las elegidas a mano. Sólo lee de ML.
 */
import { prisma } from "@/lib/prisma";
import { completarCategorias, nombreDeCategoria } from "@/lib/categorias-ml";

async function main() {
  const aplicar = process.argv.includes("--aplicar");
  const r = await completarCategorias("sendero3d", { aplicar });
  for (const x of r) {
    const p = x.propuesta;
    console.log(`${x.modelo}: ${p ? `${await nombreDeCategoria("sendero3d", p.id)} (${p.id}, ${p.origen} de ${p.de})` : "sin propuesta"}${x.actual.id ? ` · hoy ${x.actual.id} ${x.actual.origen}` : ""}`);
  }
  console.log(`\n${r.length} productos${aplicar ? ", guardado" : ", modo de prueba: no se guardó nada"}`);
}
main().finally(() => prisma.$disconnect());
