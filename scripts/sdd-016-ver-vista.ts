/**
 * docs/sdd/016 — corre una vuelta de Tendencias (con --sync) y muestra la lista como la vería la pantalla.
 *
 *   npx tsx --env-file=.env --env-file=.env.local --tsconfig tsconfig.json scripts/sdd-016-ver-vista.ts [--sync]
 */
import { prisma } from "@/lib/prisma";
import { sincronizarTendencias } from "@/lib/tendencias-sync";
import { armarVista } from "@/lib/tendencias-vista";

async function main() {
  if (process.argv.includes("--sync")) console.log(JSON.stringify(await sincronizarTendencias(), null, 1));
  const v = await armarVista();
  console.log(`\nfoto ML ${v.fotoMl} · temas ${v.temas.length} · nuevas ${v.nuevas.length} · calendario ${v.calendario.length}`);
  for (const t of v.temas.slice(0, 15)) {
    console.log(`${String(t.lectura.puntaje).padStart(4)}  ${t.nombre.padEnd(20)} ${String(t.productos).padStart(3)} prod  ${t.lectura.senales.map((s) => s.texto).join(" · ")}`);
  }
  console.log("\nNuevas:", v.nuevas.slice(0, 25).map((n) => `${n.palabra} (#${n.posicion} ${n.categoria})`).join(" | "));
  console.log("\nCalendario:", v.calendario.slice(0, 12).map((e) => `${e.fecha.slice(0, 10)} ${e.titulo}${e.temaNombre ? ` [${e.temaNombre}]` : ""}`).join(" | "));
}
main().finally(() => prisma.$disconnect());
