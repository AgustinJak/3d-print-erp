/**
 * docs/sdd/001, spec 006 — prueba de punta a punta de las recetas, con escritura,
 * en un tenant aislado que se borra al final.
 *
 *   npx tsx --env-file=.env scripts/sdd-001-probar-recetas.ts
 *
 * Arma una katana y una funda de prueba, hace "Agregar accesorio", elige la funda
 * y verifica que un pedido abierto "Con Funda" reserve hoja + funda (CA-1, CA-2,
 * CA-4) y que "Sin Funda" reserve sólo la hoja.
 */
import { prisma } from "@/lib/prisma";
import { sembrarCombinaciones } from "@/lib/combinaciones";
import { agregarAccesorio, guardarReceta, recetaDeCombinacion } from "@/lib/recetas";
import { reasignarReservas } from "@/lib/reservas";

const T = "prueba-claude-recetas";
let fallas = 0;
const ok = (c: boolean, m: string) => {
  console.log(`${c ? "✔" : "✘"} ${m}`);
  if (!c) fallas++;
};

async function limpiar() {
  await prisma.reservaStock.deleteMany({ where: { tenantId: T } });
  await prisma.produccionPendiente.deleteMany({ where: { tenantId: T } });
  await prisma.pedido.deleteMany({ where: { tenantId: T } });
  await prisma.reglaInsumo.deleteMany({ where: { tenantId: T } });
  await prisma.combinacion.deleteMany({ where: { tenantId: T } });
  await prisma.stock.deleteMany({ where: { tenantId: T } });
  await prisma.modelo.deleteMany({ where: { tenantId: T } });
  await prisma.categoria.deleteMany({ where: { tenantId: T } });
  await prisma.configTenant.deleteMany({ where: { tenantId: T } });
}

async function main() {
  await limpiar();
  // Una katana nueva como la deja el alta automática de Bodega: modelo + fila.
  const katana = await prisma.modelo.create({ data: { tenantId: T, nombre: "Katana de prueba 95cm", sku: "SS-PRU-KAT-001-95", costoFab: 9000 } });
  const hoja = await prisma.stock.create({ data: { tenantId: T, modeloId: katana.id, clave: `${katana.id}|`, etiqueta: "Katana de prueba 95cm", cantidad: 3 } });
  // La funda: modelo inactivo de la categoría Insumos, con su fila.
  const cat = await prisma.categoria.create({ data: { tenantId: T, nombre: "Insumos" } });
  const funda = await prisma.modelo.create({ data: { tenantId: T, nombre: "Funda de prueba 95cm", activo: false } });
  await prisma.categoriaModelo.create({ data: { categoriaId: cat.id, modeloId: funda.id } });
  const filaFunda = await prisma.stock.create({ data: { tenantId: T, modeloId: funda.id, clave: `${funda.id}|`, etiqueta: "Funda de prueba 95cm", cantidad: 2 } });

  await sembrarCombinaciones(prisma, T);
  ok((await prisma.combinacion.count({ where: { tenantId: T } })) === 1, "la siembra crea la combinación del modelo solo");

  const { con, sin } = await agregarAccesorio(T, katana.id, "funda");
  const combos = await prisma.combinacion.findMany({ where: { tenantId: T }, orderBy: { nombre: "asc" } });
  ok(combos.some((c) => c.id === con && c.sku === "SS-PRU-KAT-001-95-CF") && combos.some((c) => c.id === sin && c.sku === "SS-PRU-KAT-001-95-SF"),
    `"Agregar accesorio" crea Con/Sin Funda con SKU: ${combos.map((c) => c.sku).join(", ")}`);
  ok(combos.find((c) => c.variantes.length === 0)?.activo === false, "el modelo solo queda desactivado");

  let r = (await recetaDeCombinacion(T, con))!;
  ok(r.pendiente, "sin elegir funda, \"Con Funda\" queda pendiente (CA-3)");

  // Un pedido abierto de la katana con funda, cargado antes de tener receta.
  const conFundaVar = await prisma.varianteModelo.findFirst({ where: { modeloId: katana.id, nombre: "Con Funda" } });
  const sinFundaVar = await prisma.varianteModelo.findFirst({ where: { modeloId: katana.id, nombre: "Sin Funda" } });
  const ped = await prisma.pedido.create({
    data: {
      tenantId: T, estado: "CONFIRMADO",
      items: { create: [
        { modeloId: katana.id, cantidad: 1, precioUnitario: 50000, costoUnitario: 9000, combinacionId: con,
          variantesInfo: [{ nombre: "Con Funda", varianteId: conFundaVar!.id, matched: true }] },
        { modeloId: katana.id, cantidad: 1, precioUnitario: 44000, costoUnitario: 9000, combinacionId: sin,
          variantesInfo: [{ nombre: "Sin Funda", varianteId: sinFundaVar!.id, matched: true }] },
      ] },
    },
  });
  await reasignarReservas(T);
  ok((await prisma.reservaStock.count({ where: { pedidoId: ped.id, stockId: filaFunda.id } })) === 0, "antes de la receta, no se reserva funda");

  await guardarReceta(T, con, [{ stockId: filaFunda.id, cantidad: 1 }]);
  r = (await recetaDeCombinacion(T, con))!;
  ok(!r.pendiente && r.componentes.map((c) => c.etiqueta).join(" + ") === "Katana de prueba 95cm + Funda de prueba 95cm",
    `CA-1: "Con Funda" consume ${r.componentes.map((c) => c.etiqueta).join(" + ")}`);
  const rs = (await recetaDeCombinacion(T, sin))!;
  ok(rs.componentes.length === 1, `"Sin Funda" consume sólo ${rs.componentes.map((c) => c.etiqueta).join(" + ")}`);

  const reservas = await prisma.reservaStock.findMany({ where: { pedidoId: ped.id }, select: { stockId: true, cantidad: true } });
  ok(reservas.filter((x) => x.stockId === hoja.id).length === 2 && reservas.filter((x) => x.stockId === filaFunda.id).length === 1,
    `CA-2: al guardar la receta, el pedido reserva 2 hojas y 1 funda (${reservas.length} reservas)`);

  await guardarReceta(T, con, []);
  ok((await prisma.reservaStock.count({ where: { pedidoId: ped.id, stockId: filaFunda.id } })) === 0, "quitar la funda suelta su reserva");
}

main()
  .catch((e) => {
    console.error(e);
    fallas++;
  })
  .finally(async () => {
    await limpiar();
    const quedan = await prisma.modelo.count({ where: { tenantId: T } });
    console.log(quedan === 0 ? "\nTenant de prueba borrado" : `\n✘ quedaron ${quedan} modelos`);
    console.log(fallas ? `${fallas} FALLAS` : "TODO OK");
    await prisma.$disconnect();
    process.exit(fallas ? 1 : 0);
  });
