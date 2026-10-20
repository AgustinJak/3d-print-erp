/**
 * Completa `combinacion_id` en las líneas que no la tienen (docs/sdd/001, spec 003),
 * contra la base de producción. Es lo mismo que POST /api/combinaciones/backfill.
 * Por defecto simula; con --real escribe. No toca modelo, precios ni costos.
 *
 *   npx tsx --env-file=.env scripts/sdd-001-backfill.ts [--real]
 */
import { prisma } from "@/lib/prisma";
import { completarCombinacionesDeLineas } from "@/lib/combinaciones";

async function main() {
  const real = process.argv.includes("--real");
  const r = await completarCombinacionesDeLineas(prisma, "sendero3d", { simular: !real });
  console.log(JSON.stringify({ simulado: !real, ...r }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
