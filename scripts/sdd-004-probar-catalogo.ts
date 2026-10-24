/**
 * docs/sdd/004 — prueba de punta a punta del catálogo (TASK-015).
 *
 *   npx tsx --env-file=.env scripts/sdd-004-probar-catalogo.ts
 *
 * 1. Grupos de variantes, en un tenant aislado que se borra al final: los tres tipos, alta en
 *    lote, renombrar con una clave mapeada, cambiar de tipo con stock, borrar con una venta
 *    abierta, insumo y reemplazo en bloque.
 * 2. Alta desde Bodega con la convención: Bodega es de un solo negocio ("sendero3d"), así que
 *    se insertan dos piezas "ZZ Prueba Claude …" en bodega.models, se dan de alta y se borra todo
 *    (piezas, producto, insumo) al final, pase lo que pase.
 * 3. Costo con el material de cada pieza, contra la fórmula de la calculadora (sólo lee).
 */
import { prisma } from "@/lib/prisma";
import {
  agregarOpciones,
  borrarVariante,
  cambiarTipoDeGrupo,
  crearGrupo,
  ErrorDeCatalogo,
  gruposDe,
  renombrarGrupo,
  renombrarVariante,
} from "@/lib/catalogo";
import { reemplazarInsumo } from "@/lib/recetas";
import { resolverLinea } from "@/lib/mapeo-canal";
import { candidatosDeBodega, crearDesdeBodega, separarOpcion } from "@/lib/altas-bodega";
import { costosPorFilaDeStock, fabricacionDeReceta, leerParametros, leerRecetas } from "@/lib/costos-bodega";

const T = "prueba-claude-catalogo";
const BODEGA = "sendero3d";
const PREFIJO = "ZZ Prueba Claude";
let fallas = 0;
const ok = (c: boolean, m: string) => {
  console.log(`${c ? "✔" : "✘"} ${m}`);
  if (!c) fallas++;
};
async function falla(f: () => Promise<unknown>, contiene: string, m: string) {
  try {
    await f();
    ok(false, `${m} (no falló)`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    ok(e instanceof ErrorDeCatalogo && msg.includes(contiene), `${m}: "${msg}"`);
  }
}

async function limpiarTenant() {
  await prisma.reservaStock.deleteMany({ where: { tenantId: T } });
  await prisma.produccionPendiente.deleteMany({ where: { tenantId: T } });
  await prisma.mapeoCanal.deleteMany({ where: { tenantId: T } });
  await prisma.pedido.deleteMany({ where: { tenantId: T } });
  await prisma.reglaInsumo.deleteMany({ where: { tenantId: T } });
  await prisma.combinacion.deleteMany({ where: { tenantId: T } });
  await prisma.stock.deleteMany({ where: { tenantId: T } });
  await prisma.modelo.deleteMany({ where: { tenantId: T } });
  await prisma.categoria.deleteMany({ where: { tenantId: T } });
  await prisma.configTenant.deleteMany({ where: { tenantId: T } });
}

async function limpiarBodega() {
  const modelos = await prisma.modelo.findMany({ where: { tenantId: BODEGA, nombre: { startsWith: PREFIJO } }, select: { id: true } });
  const ids = modelos.map((m) => m.id);
  if (ids.length) {
    await prisma.reglaInsumo.deleteMany({ where: { modeloId: { in: ids } } });
    await prisma.combinacion.deleteMany({ where: { modeloId: { in: ids } } });
    await prisma.stock.deleteMany({ where: { modeloId: { in: ids } } });
    await prisma.modelo.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.$executeRaw`DELETE FROM bodega.models WHERE name LIKE ${PREFIJO + "%"}`;
}

async function grupos() {
  console.log("\n— Grupos de variantes —");
  const jabonera = await prisma.modelo.create({ data: { tenantId: T, nombre: "Jabonera de prueba", sku: "SS-PRU-JAB-001" } });

  await crearGrupo(T, jabonera.id, { nombre: "Diseño", tipo: "pieza", opciones: ["Duna", "Brisa", "duna "] });
  let vs = await prisma.varianteModelo.findMany({ where: { modeloId: jabonera.id }, orderBy: { nombre: "asc" } });
  let filas = await prisma.stock.findMany({ where: { tenantId: T, modeloId: jabonera.id } });
  let combos = await prisma.combinacion.findMany({ where: { tenantId: T, modeloId: jabonera.id, activo: true } });
  ok(vs.length === 2 && vs.every((v) => v.tipo === "pieza" && v.afectaStock && v.grupo === "Diseño"), `grupo de piezas: ${vs.map((v) => v.nombre).join(", ")} (el repetido se ignora)`);
  ok(filas.length === 2 && combos.length === 2, `una fila y una combinación por diseño (CA-1): ${filas.length} filas, ${combos.length} combinaciones`);

  await falla(() => crearGrupo(T, jabonera.id, { nombre: "Color", tipo: "pieza", opciones: ["Rojo"] }), "uno solo", "un segundo grupo de piezas no se permite (CA-6)");
  await falla(() => crearGrupo(T, jabonera.id, { nombre: "diseño", tipo: "decoracion", opciones: ["X"] }), "ya hay un grupo", "un grupo con el mismo nombre no se permite");
  await falla(() => agregarOpciones(T, jabonera.id, "Diseño", ["Brisa"]), "ya hay una opción", "una opción repetida no se agrega");

  await agregarOpciones(T, jabonera.id, "Diseño", ["Fases"]);
  filas = await prisma.stock.findMany({ where: { tenantId: T, modeloId: jabonera.id } });
  ok(filas.length === 3, "agregar una opción al grupo crea su fila (REQ-8)");

  // Renombrar con una clave del Shop mapeada a "Duna": sigue resolviendo a lo mismo (CA-4).
  const duna = vs.find((v) => v.nombre === "Duna")!;
  const comboDuna = await prisma.combinacion.findFirstOrThrow({ where: { tenantId: T, modeloId: jabonera.id, variantes: { equals: [duna.id] } } });
  await prisma.mapeoCanal.create({ data: { tenantId: T, canal: "shop", clave: "prod-x|op-duna", combinacionId: comboDuna.id, origen: "manual" } });
  await renombrarVariante(T, duna.id, "Duna clara");
  const comboDespues = await prisma.combinacion.findUniqueOrThrow({ where: { id: comboDuna.id } });
  const filaDuna = await prisma.stock.findFirstOrThrow({ where: { tenantId: T, variantes: { equals: [duna.id] } } });
  const r = await resolverLinea(prisma, T, "shop", "prod-x|op-duna", { sugerencia: null, contar: false });
  ok(comboDespues.nombre === "Jabonera de prueba · Duna clara" && comboDespues.sku === comboDuna.sku, `renombrar actualiza el nombre y no el SKU: "${comboDespues.nombre}" ${comboDespues.sku}`);
  ok(filaDuna.etiqueta === "Jabonera de prueba · Duna clara", `y la etiqueta de su fila: "${filaDuna.etiqueta}"`);
  ok(r.tipo === "combinacion" && r.combinacion.id === comboDuna.id, "la clave del Shop sigue resolviendo a la misma combinación (CA-4)");

  // Pieza → decoración con stock en una fila: esa queda, las vacías se borran (RN-6).
  await prisma.stock.update({ where: { id: filaDuna.id }, data: { cantidad: 3 } });
  const { filasQueQuedan } = await cambiarTipoDeGrupo(T, jabonera.id, "Diseño", "decoracion");
  filas = await prisma.stock.findMany({ where: { tenantId: T, modeloId: jabonera.id } });
  vs = await prisma.varianteModelo.findMany({ where: { modeloId: jabonera.id } });
  ok(filasQueQuedan === 1 && filas.some((f) => f.id === filaDuna.id), `pasar a decoración deja la fila con stock (${filasQueQuedan}) y borra las vacías`);
  ok(vs.every((v) => v.tipo === "decoracion" && !v.afectaStock), "las opciones quedan como decoración, sin afectar stock");
  ok(filas.some((f) => f.variantes.length === 0), "el producto vuelve a tener su fila propia");
  await cambiarTipoDeGrupo(T, jabonera.id, "Diseño", "pieza");
  filas = await prisma.stock.findMany({ where: { tenantId: T, modeloId: jabonera.id } });
  ok(filas.filter((f) => f.variantes.length === 1).length === 3, "y volver a piezas recrea sus filas");

  // Borrar con una venta abierta: no; cerrada: sí.
  const brisa = (await prisma.varianteModelo.findFirstOrThrow({ where: { modeloId: jabonera.id, nombre: "Brisa" } }));
  const comboBrisa = await prisma.combinacion.findFirstOrThrow({ where: { tenantId: T, variantes: { equals: [brisa.id] } } });
  const cliente = await prisma.cliente.create({ data: { tenantId: T, nombre: "Cliente de prueba" } }).catch(() => null);
  const pedido = await prisma.pedido.create({
    data: {
      tenantId: T,
      estado: "CONFIRMADO",
      canalVenta: "manual",
      ...(cliente ? { clienteId: cliente.id } : {}),
      items: { create: [{ modeloId: jabonera.id, combinacionId: comboBrisa.id, cantidad: 1, precioUnitario: 1000, costoUnitario: 100 }] },
    },
  });
  await falla(() => borrarVariante(T, brisa.id), "venta abierta", "con una venta abierta no se borra");
  await prisma.pedido.update({ where: { id: pedido.id }, data: { estado: "COMPLETADO" } });
  await borrarVariante(T, brisa.id);
  const comboBrisaDespues = await prisma.combinacion.findUniqueOrThrow({ where: { id: comboBrisa.id } });
  ok(!(await prisma.varianteModelo.findUnique({ where: { id: brisa.id } })) && !comboBrisaDespues.activo, "cerrada la venta, se borra y su combinación queda desactivada");
  if (cliente) await prisma.pedido.delete({ where: { id: pedido.id } }).then(() => prisma.cliente.delete({ where: { id: cliente.id } }));

  // Decoración: misma fila para todas (CA-5).
  const vaso = await prisma.modelo.create({ data: { tenantId: T, nombre: "Vaso de prueba" } });
  await prisma.stock.create({ data: { tenantId: T, modeloId: vaso.id, clave: `${vaso.id}|`, etiqueta: "Vaso de prueba" } });
  await crearGrupo(T, vaso.id, { nombre: "Firma", tipo: "decoracion", opciones: ["Jin", "Suga", "V"] });
  const filasVaso = await prisma.stock.count({ where: { tenantId: T, modeloId: vaso.id } });
  const combosVaso = await prisma.combinacion.count({ where: { tenantId: T, modeloId: vaso.id, activo: true } });
  ok(filasVaso === 1 && combosVaso === 3, `decoración: una sola fila y una combinación por firma (${filasVaso} fila, ${combosVaso} combinaciones)`);

  // Insumo: el par Con/Sin con su receta, renombrar el grupo y reemplazar en bloque.
  const cat = await prisma.categoria.create({ data: { tenantId: T, nombre: "Insumos" } });
  const nuevaFunda = async (nombre: string) => {
    const m = await prisma.modelo.create({ data: { tenantId: T, nombre, activo: false, esInsumo: true, categorias: { create: [{ categoriaId: cat.id }] } } });
    return prisma.stock.create({ data: { tenantId: T, modeloId: m.id, clave: `${m.id}|`, etiqueta: nombre, cantidad: 5 } });
  };
  const fundaA = await nuevaFunda("Funda A de prueba");
  const fundaB = await nuevaFunda("Funda B de prueba");
  const katana = await prisma.modelo.create({ data: { tenantId: T, nombre: "Katana de prueba 95cm", sku: "SS-PRU-KAT-095" } });
  await prisma.stock.create({ data: { tenantId: T, modeloId: katana.id, clave: `${katana.id}|`, etiqueta: "Katana de prueba 95cm", cantidad: 2 } });
  await crearGrupo(T, katana.id, { nombre: "funda", tipo: "insumo", insumoStockId: fundaA.id });
  const vk = await prisma.varianteModelo.findMany({ where: { modeloId: katana.id }, orderBy: { nombre: "asc" } });
  const reglas = await prisma.reglaInsumo.findMany({ where: { tenantId: T, modeloId: katana.id } });
  ok(vk.map((v) => `${v.nombre}/${v.grupo}/${v.tipo}`).join(", ") === "Con Funda/Funda/insumo, Sin Funda/Funda/insumo", `grupo de insumo: ${vk.map((v) => v.nombre).join(", ")}`);
  ok(reglas.length === 1 && reglas[0].stockId === fundaA.id && reglas[0].requiere[0] === vk[0].id, '"Con Funda" descuenta la funda elegida (CA-3)');
  await falla(() => crearGrupo(T, katana.id, { nombre: "Exhibidor", tipo: "insumo" }), "uno solo", "un segundo grupo de insumo no se permite");
  await falla(() => renombrarVariante(T, vk[0].id, "Con estuche"), "nombre del grupo", '"Con" y "Sin" no se renombran sueltos');

  await renombrarGrupo(T, katana.id, "Funda", "estuche");
  const vk2 = await prisma.varianteModelo.findMany({ where: { modeloId: katana.id }, orderBy: { nombre: "asc" } });
  const combosK = await prisma.combinacion.findMany({ where: { tenantId: T, modeloId: katana.id, activo: true }, orderBy: { nombre: "asc" } });
  ok(vk2.map((v) => v.nombre).join(", ") === "Con Estuche, Sin Estuche" && vk2.every((v) => v.grupo === "Estuche"), `renombrar el grupo de insumo renombra el par: ${vk2.map((v) => v.nombre).join(", ")}`);
  ok(combosK.map((c) => c.nombre).join(" | ") === "Katana de prueba 95cm · Con Estuche | Katana de prueba 95cm · Sin Estuche", `y sus combinaciones: ${combosK.map((c) => c.nombre).join(" | ")}`);

  const { recetas } = await reemplazarInsumo(T, fundaA.id, fundaB.id);
  const reglas2 = await prisma.reglaInsumo.findMany({ where: { tenantId: T, modeloId: katana.id } });
  ok(recetas === 1 && reglas2[0].stockId === fundaB.id, "reemplazar en bloque mueve las recetas a la otra funda (spec 006, CA-3)");

  const todos = await prisma.varianteModelo.findMany({ where: { modelo: { tenantId: T } }, select: { id: true, nombre: true, afectaStock: true, grupo: true, tipo: true } });
  ok(todos.every((v) => (v.tipo === "pieza") === v.afectaStock), "en todas las variantes, pieza ⇔ afecta stock");
  ok(gruposDe(todos.filter((v) => v.grupo === "Firma")).length === 1, "gruposDe agrupa por nombre de grupo");
}

async function altaDesdeBodega() {
  console.log("\n— Alta desde Bodega (piezas de prueba en sendero3d, se borran al final) —");
  ok(JSON.stringify(separarOpcion("Bola de JOJOS · Verde común")) === JSON.stringify({ producto: "Bola de JOJOS", opcion: "Verde común" }), "separa \"Producto · Opción\"");
  ok(separarOpcion("Katana · Edición · Roja")?.producto === "Katana · Edición", "toma el último punto medio");
  ok(separarOpcion("Hacha Prime") === null, "sin punto medio no hay opción");

  const ids = { rojo: "zz-prueba-claude-rojo", azul: "zz-prueba-claude-azul", funda: "zz-prueba-claude-funda", simple: "zz-prueba-claude-simple" };
  await prisma.$executeRaw`
    INSERT INTO bodega.models (id, name, category) VALUES
      (${ids.rojo}, ${PREFIJO + " Bola · Rojo"}, 'Llaveros'),
      (${ids.azul}, ${PREFIJO + " Bola · Azul"}, 'Llaveros'),
      (${ids.funda}, ${PREFIJO + " Funda"}, 'Insumos'),
      (${ids.simple}, ${PREFIJO + " Hacha"}, null)`;

  const { nuevos, sinTraer } = await candidatosDeBodega(BODEGA);
  const destino = (id: string) => [...nuevos, ...sinTraer].find((c) => c.bodegaModelId === id);
  ok(destino(ids.rojo)?.accion === "opcion" && destino(ids.rojo)?.producto?.nombre === `${PREFIJO} Bola`, `"… Bola · Rojo" va como opción de "${destino(ids.rojo)?.producto?.nombre}"`);
  ok(destino(ids.funda)?.accion === "insumo", "la de la categoría Insumos va como insumo");
  ok(destino(ids.simple)?.accion === "crear", "la otra, como producto simple");

  const r = await crearDesdeBodega(BODEGA, [ids.rojo, ids.azul, ids.funda]);
  ok(r.omitidos.length === 0, `sin omitidos${r.omitidos.length ? ": " + r.omitidos.map((o) => `${o.nombre} (${o.motivo})`).join("; ") : ""}`);
  const bola = await prisma.modelo.findFirst({
    where: { tenantId: BODEGA, nombre: `${PREFIJO} Bola` },
    include: { variantes: true, stock: true },
  });
  ok(!!bola && bola.variantes.length === 2 && bola.variantes.every((v) => v.tipo === "pieza" && v.grupo === "Variante"), `un solo producto con dos opciones de pieza (CA-1): ${bola?.variantes.map((v) => v.nombre).join(", ")}`);
  ok(!!bola && bola.stock.length === 2 && bola.stock.every((f) => f.bodegaModelId === ids.rojo || f.bodegaModelId === ids.azul), "cada opción con su fila enganchada a su pieza");
  const funda = await prisma.modelo.findFirst({ where: { tenantId: BODEGA, nombre: `${PREFIJO} Funda` }, include: { stock: true } });
  ok(!!funda && funda.esInsumo && !funda.activo && funda.stock[0]?.bodegaModelId === ids.funda, "la funda entra como insumo, inactiva como producto, con su fila (CA-2)");
  const bolas = await prisma.modelo.count({ where: { tenantId: BODEGA, nombre: { startsWith: `${PREFIJO} Bola` } } });
  ok(bolas === 1, `no se creó un producto por pieza: ${bolas} producto(s) "Bola"`);
}

async function costoConMaterial() {
  console.log("\n— Costo con el material de cada pieza (sólo lee) —");
  const [parametros, recetas, costos] = await Promise.all([leerParametros(), leerRecetas(), costosPorFilaDeStock(BODEGA)]);
  const conMaterial = [...recetas.values()].filter((r) => r.precioKg != null && r.precioKg !== parametros.precioKg);
  console.log(`  ${recetas.size} piezas con receta; ${conMaterial.length} con un material de otro precio que el por defecto ($${parametros.precioKg}/kg)`);
  const fila = [...costos.values()].find((c) => c.receta.precioKg != null && c.receta.precioKg !== parametros.precioKg);
  if (!fila) {
    console.log("  (ninguna fila enganchada usa todavía un material distinto: se prueba la fórmula con una receta inventada)");
    const r = { bodegaModelId: "x", nombre: "x", gramos: 100, segundos: 3600, insumos: 0, precioKg: 15000 };
    const { fabricacionDePieza } = await import("@/lib/costos-bodega");
    ok(Math.abs(fabricacionDePieza(parametros, r) - fabricacionDeReceta({ ...parametros, precioKg: 15000 }, 100, 3600)) < 0.01, "100 g en PETG a $15.000/kg usa $15.000, no el precio por defecto (CA-1)");
    return;
  }
  const esperado = fabricacionDeReceta({ ...parametros, precioKg: fila.receta.precioKg! }, fila.receta.gramos, fila.receta.segundos);
  ok(Math.abs(fila.fab - esperado) < 1, `${fila.etiqueta}: fabricación con $${fila.receta.precioKg}/kg = ${Math.round(fila.fab)} (CA-1)`);
}

async function main() {
  await limpiarTenant();
  await limpiarBodega();
  await grupos();
  await altaDesdeBodega();
  await costoConMaterial();
  console.log(`\n${fallas === 0 ? "TODO OK" : `${fallas} FALLAS`}`);
  if (fallas) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await limpiarTenant().catch((e) => console.error("limpiando el tenant:", e));
    await limpiarBodega().catch((e) => console.error("limpiando Bodega:", e));
    await prisma.$disconnect();
  });
