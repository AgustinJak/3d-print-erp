/**
 * Siembra del mapeo de ML contra la base de producción (docs/sdd/001, TASK-011).
 * Sólo lee Mercado Libre. Por defecto simula; con --real escribe mapeos_canal.
 *
 *   npx tsx --env-file=.env scripts/sdd-001-sembrar-ml.ts [--real] [--rehacer] [MLA…]
 */
import { sembrarMapeosMl } from "../src/lib/mapeo-ml";
import { prisma } from "../src/lib/prisma";

async function main() {
  const args = process.argv.slice(2);
  const real = args.includes("--real");
  const mlas = args.filter((a) => /^MLA\d+$/.test(a));
  const r = await sembrarMapeosMl("sendero3d", {
    simular: !real,
    rehacer: args.includes("--rehacer"),
    ...(mlas.length ? { mlas } : {}),
  });
  console.log(JSON.stringify({ ...r, detalle: undefined }, null, 2));
  const porResultado = new Map<string, number>();
  for (const d of r.detalle) {
    const k = d.resultado.startsWith("→") ? "mapeada" : d.resultado.split(" ")[0];
    porResultado.set(k, (porResultado.get(k) ?? 0) + 1);
  }
  console.log("por resultado:", Object.fromEntries(porResultado));
  console.log("\n— Cola —");
  for (const d of r.detalle.filter((x) => x.resultado.startsWith("cola"))) console.log(`${d.clave}  ${d.descripcion}  [${d.resultado}]`);
  console.log("\n— Combinaciones nuevas —");
  for (const d of r.detalle.filter((x) => x.resultado.startsWith("→ combinación nueva"))) console.log(`${d.clave}  ${d.descripcion}  ${d.resultado}`);
  if (process.env.DETALLE) for (const d of r.detalle) console.log(`${d.clave}  ${d.descripcion}  ${d.resultado}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
