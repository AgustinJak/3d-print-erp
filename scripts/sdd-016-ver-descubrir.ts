/**
 * docs/sdd/016 — lee las búsquedas de ML (con --leer, guarda la foto de hoy) y muestra "Descubrir"
 * como lo vería la pantalla.
 *
 *   npx tsx --env-file=.env --env-file=.env.local --tsconfig tsconfig.json scripts/sdd-016-ver-descubrir.ts [--leer]
 */
import { prisma } from "@/lib/prisma";
import { leerBusquedasMl } from "@/lib/tendencias-ml";
import { armarDescubrir } from "@/lib/tendencias-descubrir";

async function main() {
  if (process.argv.includes("--leer")) {
    const r = await leerBusquedasMl();
    console.log(`leídas: ${r.categorias} categorías, ${r.conDatos} con datos, ${r.palabras} palabras, ${r.errores.length} errores`);
  }
  const d = await armarDescubrir();
  console.log(`foto ${d.fotoMl} · comparación ${d.conComparacion}`);
  console.log("\nLo que más se repite:", d.destacadas.map((x) => `${x.palabra} (${x.categorias.join(", ")})`).join(" | "));
  for (const v of d.vidrieras) {
    const nuevas = v.busquedas.filter((b) => !b.tema?.conProductos);
    console.log(`\n${v.nombre}: ${v.busquedas.length} · ${nuevas.slice(0, 10).map((b) => `#${b.posicion} ${b.palabra}${b.tema ? ` [${b.tema.nombre}]` : ""}`).join(" | ")}`);
    const tuyas = v.busquedas.filter((b) => b.tema?.conProductos);
    if (tuyas.length) console.log(`  ya tenés: ${tuyas.map((b) => `${b.palabra} [${b.tema!.nombre}]`).join(" | ")}`);
  }
}
main().finally(() => prisma.$disconnect());
