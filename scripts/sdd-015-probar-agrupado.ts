/**
 * docs/sdd/015 — la propuesta real, agrupada por producto como la muestra Precios.
 *
 *   npx tsx --env-file=.env --env-file=.env.local --tsconfig tsconfig.json scripts/sdd-015-probar-agrupado.ts
 *
 * Mira que no se pierda nada al pasar de "por canal" a "por producto": cada publicación con producto
 * queda en uno, y lo que se puede aplicar suma lo mismo que antes.
 */
import { prisma } from "@/lib/prisma";
import { armarPropuesta } from "@/lib/precios-propuesta";
import { agrupar, hayPendientes, sePuedeMl } from "@/components/precios/por-producto";
import { conDiferencia } from "@/lib/precios-reglas";

async function main() {
  const d = await armarPropuesta("sendero3d");
  const ps = agrupar(d, "todas");
  const ml = d.canales.filter((f) => f.canal === "mercadolibre");
  const web = d.canales.filter((f) => f.canal === "shop");
  const antesMl = ml.filter((f) => f.modeloId && sePuedeMl(f)).length;
  const ahoraMl = ps.reduce((n, p) => n + p.pendientes.ml.length, 0);
  const productosWebAntes = new Set(web.filter((f) => f.modeloId && !f.motivo && !f.ignorada && conDiferencia(f)).map((f) => f.modeloId)).size;
  const productosWebAhora = ps.filter((p) => p.pendientes.web.length).length;
  console.log(`productos ${ps.length} · con cambios ${ps.filter(hayPendientes).length} · falta costear ${ps.filter((p) => p.faltaCostear).length}`);
  console.log(`ML para aplicar: por canal ${antesMl} · por producto ${ahoraMl}`);
  console.log(`Web productos: por canal ${productosWebAntes} · por producto ${productosWebAhora}`);
  console.log(`ERP para aplicar: ${ps.filter((p) => p.pendientes.erp).length}`);
  console.log(`sin producto: ML ${ml.filter((f) => !f.modeloId).length} · web ${web.filter((f) => !f.modeloId).length}`);
  const enProductos = ps.reduce((n, p) => n + p.ml.length + p.web.length, 0);
  const conModelo = d.canales.filter((f) => f.modeloId).length;
  console.log(`filas con producto ${conModelo} · repartidas ${enProductos} → ${conModelo === enProductos ? "OK" : "FALTAN"}`);
  const sinNombre = ps.filter((p) => !d.productos[p.id]);
  console.log(`productos sin ficha en propuesta.productos: ${sinNombre.length}`);
  console.log(`con foto: ${ps.filter((p) => p.foto).length}`);
  const ok = antesMl === ahoraMl && productosWebAntes === productosWebAhora && conModelo === enProductos;
  console.log(ok ? "\nTODO BIEN" : "\nHAY DIFERENCIAS");
  process.exitCode = ok ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
