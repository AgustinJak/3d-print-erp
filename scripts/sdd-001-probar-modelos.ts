/**
 * docs/sdd/001 — un modelo nuevo y la edición de sus variantes mantienen sus
 * combinaciones y recetas. Tenant aislado, se borra al final.
 *
 *   npx tsx --env-file=.env scripts/sdd-001-probar-modelos.ts
 */
import { prisma } from "@/lib/prisma";
import { sembrarCombinacionesDeModelo, soltarVariantesBorradas } from "@/lib/combinaciones";
import { agregarAccesorio, guardarReceta } from "@/lib/recetas";

const T = "prueba-claude-modelos";
let fallas = 0;
const ok = (c: boolean, m: string) => {
  console.log(`${c ? "✔" : "✘"} ${m}`);
  if (!c) fallas++;
};
const activas = async (modeloId: string) =>
  (await prisma.combinacion.findMany({ where: { tenantId: T, modeloId, activo: true }, select: { nombre: true } })).map((c) => c.nombre).sort();

async function limpiar() {
  await prisma.reglaInsumo.deleteMany({ where: { tenantId: T } });
  await prisma.combinacion.deleteMany({ where: { tenantId: T } });
  await prisma.stock.deleteMany({ where: { tenantId: T } });
  await prisma.modelo.deleteMany({ where: { tenantId: T } });
  await prisma.categoria.deleteMany({ where: { tenantId: T } });
  await prisma.configTenant.deleteMany({ where: { tenantId: T } });
}

async function main() {
  await limpiar();
  // Como lo deja POST /api/modelos o el alta automática de Bodega.
  const m = await prisma.modelo.create({ data: { tenantId: T, nombre: "Katana nueva de prueba", sku: "SS-PRU-KAT-002" } });
  await sembrarCombinacionesDeModelo(prisma, T, m.id);
  ok((await activas(m.id)).join() === "Katana nueva de prueba", "modelo nuevo: nace con su combinación");

  const cat = await prisma.categoria.create({ data: { tenantId: T, nombre: "Insumos" } });
  const funda = await prisma.modelo.create({ data: { tenantId: T, nombre: "Funda de prueba", activo: false } });
  await prisma.categoriaModelo.create({ data: { categoriaId: cat.id, modeloId: funda.id } });
  const fila = await prisma.stock.create({ data: { tenantId: T, modeloId: funda.id, clave: `${funda.id}|`, etiqueta: "Funda de prueba" } });

  const { con } = await agregarAccesorio(T, m.id, "Funda", fila.id);
  ok((await activas(m.id)).join() === "Katana nueva de prueba · Con Funda,Katana nueva de prueba · Sin Funda", "con accesorio: Con/Sin activas, el modelo solo no");
  ok((await prisma.reglaInsumo.count({ where: { tenantId: T, modeloId: m.id } })) === 1, "la receta de Con Funda existe");

  // Editar el modelo sin tocar variantes: no cambia nada.
  await sembrarCombinacionesDeModelo(prisma, T, m.id);
  ok((await prisma.combinacion.count({ where: { tenantId: T, modeloId: m.id } })) === 3, "guardar sin cambios no crea combinaciones");

  // Renombrar "Con Funda" en el formulario = borrarla y crear otra.
  const conVar = await prisma.varianteModelo.findFirst({ where: { modeloId: m.id, nombre: "Con Funda" } });
  await prisma.varianteModelo.delete({ where: { id: conVar!.id } });
  await soltarVariantesBorradas(prisma, T, m.id, [conVar!.id]);
  await prisma.varianteModelo.create({ data: { modeloId: m.id, nombre: "Con Funda negra", grupo: "Funda negra", tipo: "insumo" } });
  await sembrarCombinacionesDeModelo(prisma, T, m.id);
  ok((await prisma.combinacion.findUnique({ where: { id: con } }))?.activo === false, "renombrar: la combinación vieja queda desactivada");
  ok((await prisma.reglaInsumo.count({ where: { tenantId: T, modeloId: m.id } })) === 0, "renombrar: la receta vieja se borra (ya no aplica)");
  ok((await activas(m.id)).includes("Katana nueva de prueba · Con Funda negra"), "renombrar: la variante nueva tiene su combinación");
  const nueva = await prisma.combinacion.findFirst({ where: { tenantId: T, modeloId: m.id, nombre: { contains: "negra" } } });
  await guardarReceta(T, nueva!.id, [{ stockId: fila.id, cantidad: 1 }]);
  ok((await prisma.reglaInsumo.count({ where: { tenantId: T, modeloId: m.id } })) === 1, "y se le puede volver a elegir la funda");

  // Borrar todas las variantes: vuelve "el modelo solo".
  const todas = await prisma.varianteModelo.findMany({ where: { modeloId: m.id }, select: { id: true } });
  await prisma.varianteModelo.deleteMany({ where: { modeloId: m.id } });
  await soltarVariantesBorradas(prisma, T, m.id, todas.map((v) => v.id));
  await sembrarCombinacionesDeModelo(prisma, T, m.id);
  ok((await activas(m.id)).join() === "Katana nueva de prueba", "sin variantes: el modelo solo vuelve a estar activo");
}

main()
  .catch((e) => {
    console.error(e);
    fallas++;
  })
  .finally(async () => {
    await limpiar();
    console.log((await prisma.modelo.count({ where: { tenantId: T } })) === 0 ? "\nTenant de prueba borrado" : "\n✘ quedó basura");
    console.log(fallas ? `${fallas} FALLAS` : "TODO OK");
    await prisma.$disconnect();
    process.exit(fallas ? 1 : 0);
  });
