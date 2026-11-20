/**
 * docs/sdd/016 — lee las búsquedas de ML de verdad, sin guardar, y muestra qué coincide con qué tema.
 *
 *   npx tsx --env-file=.env --env-file=.env.local --tsconfig tsconfig.json scripts/sdd-016-probar-busquedas.ts
 */
import { prisma } from "@/lib/prisma";
import { leerBusquedasMl } from "@/lib/tendencias-ml";
import { esGenerica, normalizar, temaDeTexto } from "@/lib/temas";

async function main() {
  const r = await leerBusquedasMl({ guardar: false });
  console.log(`categorías ${r.categorias} · con datos ${r.conDatos} · palabras ${r.palabras} · errores ${r.errores.length}`);
  for (const e of r.errores) console.log("  error", e.categoria, e.error);

  const porCategoria = new Map<string, number>();
  for (const f of r.filas) porCategoria.set(`${f.categoriaId} ${f.categoria}`, (porCategoria.get(`${f.categoriaId} ${f.categoria}`) ?? 0) + 1);
  for (const [c, n] of porCategoria) console.log(`  ${c}: ${n}`);

  const temas = await prisma.tema.findMany({ where: { activo: true }, select: { id: true, nombre: true, alias: true } });
  const coinciden = new Map<string, string[]>();
  const nuevas = new Set<string>();
  for (const f of r.filas) {
    const t = temaDeTexto(f.palabra, temas);
    if (t) coinciden.set(t.nombre, [...new Set([...(coinciden.get(t.nombre) ?? []), `${f.palabra} (#${f.posicion} ${f.categoria})`])]);
    else if (f.categoriaId !== "MLA" && !esGenerica(normalizar(f.palabra))) nuevas.add(f.palabra);
  }
  console.log("\nCoinciden con un tema:");
  for (const [t, ps] of coinciden) console.log(`  ${t}: ${ps.slice(0, 4).join(" · ")}`);
  console.log(`\nBúsquedas nuevas fuera del sitio general (${nuevas.size}), las primeras 40:`);
  console.log("  " + [...nuevas].slice(0, 40).join(" | "));
}

main().finally(() => prisma.$disconnect());
