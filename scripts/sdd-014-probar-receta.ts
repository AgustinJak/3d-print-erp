/**
 * docs/sdd/014, spec 003, REQ-7 — guardar la receta de una pieza desde el ERP.
 *
 *   npx tsx --env-file=.env --env-file=.env.local --tsconfig tsconfig.json scripts/sdd-014-probar-receta.ts
 *
 * Toma una pieza real con receta, le cambia los gramos, mira que quede y la deja como estaba.
 */
import { prisma } from "@/lib/prisma";
import { guardarRecetaDePieza, recetasDePiezas } from "@/lib/recetas-de-piezas";

let pruebas = 0;
let fallas = 0;
function ok(cond: boolean, que: string, detalle?: unknown) {
  pruebas++;
  if (!cond) fallas++;
  console.log(`${cond ? "✓" : "✗"} ${que}${cond || detalle === undefined ? "" : `\n    ${JSON.stringify(detalle)}`}`);
}

async function main() {
  const [p] = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM bodega.models WHERE filament_grams IS NOT NULL AND print_time_seconds IS NOT NULL ORDER BY name LIMIT 1`;
  const antes = (await recetasDePiezas("sendero3d", [p.id]))[p.id];
  console.log("pieza:", antes.nombre, antes);
  try {
    ok("error" in (await guardarRecetaDePieza("demo", p.id, { gramos: 1 })), "la cuenta demo no puede");
    ok("error" in (await guardarRecetaDePieza("sendero3d", p.id, { gramos: -3 })), "gramos negativos no");
    ok("error" in (await guardarRecetaDePieza("sendero3d", p.id, { materialId: "no-existe" })), "un material que no existe no");
    ok("error" in (await guardarRecetaDePieza("sendero3d", "no-existe", { gramos: 1 })), "una pieza que no existe no");

    const r = await guardarRecetaDePieza("sendero3d", p.id, { gramos: (antes.gramos ?? 0) + 1 });
    const despues = (await recetasDePiezas("sendero3d", [p.id]))[p.id];
    ok("ok" in r && despues.gramos === (antes.gramos ?? 0) + 1, "guarda los gramos", despues);
    ok(despues.segundos === antes.segundos && despues.materialId === antes.materialId && despues.insumos === antes.insumos, "no toca lo que no vino en el pedido", despues);
  } finally {
    await guardarRecetaDePieza("sendero3d", p.id, { gramos: antes.gramos, segundos: antes.segundos, materialId: antes.materialId, insumos: antes.insumos });
    const final = (await recetasDePiezas("sendero3d", [p.id]))[p.id];
    ok(JSON.stringify(final) === JSON.stringify(antes), "quedó como estaba", { antes, final });
  }
  console.log(`\n${pruebas - fallas} de ${pruebas} bien`);
}
main()
  .catch((e) => {
    console.error(e);
    fallas++;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(fallas ? 1 : 0);
  });
