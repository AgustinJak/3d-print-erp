/**
 * docs/sdd/017 — la lista de envíos para despachar contra la base y ML (sólo lectura).
 *
 *   npx tsx --env-file=.env --env-file=.env.local --tsconfig tsconfig.json scripts/sdd-017-probar-envios.ts
 *
 * Muestra lo que vería la Bodega y revisa que no viaje nada del comprador.
 */
import { prisma } from "@/lib/prisma";
import { enviosParaDespachar } from "@/lib/envios-para-despachar";

async function main() {
  const r = await enviosParaDespachar();
  console.log(`envíos ${r.envios.length} · errores ${r.errores.length}`);
  for (const e of r.errores) console.log("  error", e.venta, e.error);
  for (const e of r.envios) {
    console.log(`${(e.despacho ?? "?").slice(0, 16).replace("T", " ")}${e.conHora ? "" : " (día)"}  ${e.flex ? "FLEX " : "     "} ${e.estado.padEnd(14)} ${e.ml.status}/${e.ml.substatus}  ${e.productos.map((p) => `${p.nombre} x${p.cantidad}`).join(" | ")}`);
  }
  const claves = new Set(r.envios.flatMap((e) => Object.keys(e)));
  const prohibidas = ["receiver", "buyer", "address", "nickname", "nombre_cliente", "documento"];
  console.log("\ncampos:", [...claves].join(", "));
  console.log(prohibidas.some((p) => JSON.stringify(r).toLowerCase().includes(`"${p}`)) ? "✗ viaja algo del comprador" : "✓ sin datos del comprador");
}
main().finally(() => prisma.$disconnect());
