/**
 * docs/sdd/003 — precio de cada combinación (TASK-008), contra la spec 003.
 *
 *   npx tsx --env-file=.env scripts/sdd-003-probar-precios.ts
 *
 * Sólo lee. CA-1 y CA-2 corren sobre los datos de verdad; CA-3, CA-4 y el precio de venta del ERP
 * (RN-4), sobre combinaciones armadas acá, para no depender de qué esté cargado hoy.
 *
 * - CA-1: donde Bodega guardó la foto de precios y el costo no cambió desde entonces, los tres
 *   precios del ERP son los de la foto ($1 de tolerancia).
 * - CA-2: "Con Funda" es la pieza de "Sin Funda" con el costo de la funda sumado como insumo, y
 *   el precio es el que da la calculadora de Bodega con esos números.
 * - CA-3: un pack de 10 vale 10 × el precio con 20 % menos, redondeado como la pieza.
 * - CA-4: un insumo sin costo deja la combinación en "falta costear", sin precio.
 */
import { existsSync } from "fs";
import { resolve } from "path";
import { pathToFileURL } from "url";
import { prisma } from "@/lib/prisma";
import { costosPorFilaDeStock, type CostoDeFila } from "@/lib/costos-bodega";
import * as copia from "@/lib/precios-formula";
import {
  cargarContextoDePrecios,
  gastosDe,
  precioDeClave,
  precioDeCombinacion,
  preciosDeCombinaciones,
  precioDeVentaErp,
  type ContextoDePrecios,
  type PrecioDeCombinacion,
} from "@/lib/precios-combinacion";

const T = "sendero3d";
let fallas = 0;
let pruebas = 0;
function ok(cond: boolean, que: string, detalle?: unknown) {
  pruebas++;
  if (cond) return;
  fallas++;
  console.log(`  ✗ ${que}`, detalle === undefined ? "" : JSON.stringify(detalle));
}
const cerca = (a: number, b: number) => Math.abs(a - b) < 1;

/** La fórmula de Bodega en persona si el repo está al lado; si no, la copia (que es la misma). */
async function formulaDeBodega(): Promise<Pick<typeof copia, "tresPrecios">> {
  const ruta = resolve("..", "Bodega", "Bodega3D-App", "src", "renderer", "src", "lib", "politica.ts");
  if (!existsSync(ruta)) return copia;
  return import(pathToFileURL(ruta).href);
}

async function ca1(ps: PrecioDeCombinacion[]) {
  console.log("CA-1 · los precios de la foto de Bodega");
  const comparables = ps.filter((p) => p.precios && p.foto && p.costo!.receta.length === 0);
  let comparadas = 0;
  for (const p of comparables) {
    const costo = p.costo!.fabricacion + p.costo!.insumos;
    if (!cerca(costo, p.foto!.costo)) {
      console.log(`  · ${p.nombre}: el costo cambió desde la foto (${Math.round(p.foto!.costo)} → ${Math.round(costo)}), no se compara`);
      continue;
    }
    comparadas++;
    const { ml, mlPublicado, web, personalizado } = p.precios!;
    const f = p.foto!;
    ok(cerca(ml, f.ml) && cerca(mlPublicado, f.mlPublicado) && cerca(web, f.web) && cerca(personalizado, f.personalizado), `${p.nombre} igual a la foto`, {
      erp: { ml, mlPublicado, web, personalizado },
      foto: f,
    });
    console.log(`  · ${p.nombre}: ML ${ml} (publicado ${mlPublicado}), web ${web}, personalizados ${personalizado} — igual a Bodega`);
  }
  ok(comparadas > 0, "hay al menos una foto de Bodega para comparar");
}

async function ca2(ps: PrecioDeCombinacion[], cx: ContextoDePrecios, costos: Map<string, CostoDeFila>) {
  console.log("CA-2 · Con Funda = Sin Funda + la funda como insumo");
  const bodega = await formulaDeBodega();
  let pares = 0;
  for (const con of ps.filter((p) => p.precios && / · con funda$/i.test(p.nombre))) {
    const sin = ps.find((p) => p.precios && p.nombre.toLowerCase() === con.nombre.toLowerCase().replace(/con funda$/, "sin funda"));
    if (!sin) continue;
    pares++;
    const funda = con.costo!.receta.reduce((a, r) => a + costos.get(r.stockId)!.total * r.cantidad, 0);
    ok(con.costo!.fabricacion === sin.costo!.fabricacion, `${con.nombre}: misma pieza que la Sin Funda`);
    ok(cerca(con.costo!.insumos - sin.costo!.insumos, funda), `${con.nombre}: la diferencia de insumos es la funda`, { con: con.costo!.insumos, sin: sin.costo!.insumos, funda });
    const g = gastosDe(cx.general.gastos, con.politica);
    const esperado = bodega.tresPrecios(g, con.costo!.fabricacion, con.costo!.insumos, con.politica.redondeo);
    ok(esperado.ml === con.precios!.ml && esperado.web === con.precios!.web && esperado.personalizado === con.precios!.personalizado, `${con.nombre}: el precio de la calculadora`, { esperado, erp: con.precios });
    console.log(`  · ${con.nombre}: funda $${Math.round(funda)} → ML ${con.precios!.ml} (sin funda ${sin.precios!.ml})`);
  }
  ok(pares > 0, "hay al menos un par Con/Sin Funda con precio");
}

/** Una combinación armada a mano, con el precio de web que pide el caso. */
function combinacionDePrueba(precios: Partial<copia.TresPrecios>, redondeo: copia.Redondeo = "noventa", nombre = "Llavero de prueba"): PrecioDeCombinacion {
  return {
    combinacionId: nombre,
    modeloId: "m",
    modelo: "m",
    nombre,
    sku: null,
    variantes: [],
    costo: null,
    falta: [],
    politica: { margen: 50, redondeo, promo: 0, propia: false },
    precios: { ml: 3490, mlPublicado: 3490, web: 2800, personalizado: 1990, ganancia: 1000, ...precios },
    foto: null,
  };
}

function ca3() {
  console.log("CA-3 · packs con el descuento del tramo");
  const g = { ...copia.GASTOS_MEDIDOS, webEnvioGratisDesde: 0 };
  const p = combinacionDePrueba({});
  const casos: Array<[number, copia.Redondeo, number]> = [
    [1, "noventa", 2800], // una unidad: el precio de la web tal cual
    [3, "noventa", 8490], // menos de 5: sin descuento, 8.400 redondeado
    [5, "noventa", 12690], // 10 % menos: 12.600
    [10, "noventa", 22490], // el caso de la spec: 10 × 2.240 = 22.400
    [10, "mil", 23000],
    [20, "noventa", 39290], // 30 % menos: 39.200
  ];
  for (const [n, redondeo, esperado] of casos) {
    const r = precioDeClave({ ...p, politica: { ...p.politica, redondeo } }, "shop", n, g);
    ok(r === esperado, `pack de ${n} (${redondeo}) = ${esperado}`, r);
  }
  // En ML, con promo: el total se redondea y después se infla para publicar, salvo que el inflado
  // pase los $30.000 (docs/sdd/006, spec 003 RN-6): el pack de 10 a $27.990 se publica sin promo.
  const conPromo = { ...p, politica: { ...p.politica, promo: 10 } };
  const r = precioDeClave(conPromo, "mercadolibre", 10, g);
  const total = copia.redondear(10 * 3490 * 0.8, "noventa");
  ok(r === copia.precioConPromo(total, 10, copia.techoDeRedondeo(g, "ml", total)).publicado, "pack de 10 en ML con 10 % de promo", r);
  ok(precioDeClave({ ...p, precios: null }, "shop", 10, g) === null, "sin precio no hay precio de pack");
  console.log(`  · pack de 10 a $2.800: ${precioDeClave(p, "shop", 10, g)}`);
}

function ca4(cx: ContextoDePrecios, ps: PrecioDeCombinacion[]) {
  console.log("CA-4 · insumo sin costo = falta costear");
  // Armada: una katana con costo cuya funda no tiene.
  const reservas = {
    stockPorClave: new Map([["k|", { id: "fila-katana", etiqueta: "Katana", cantidad: 0 }]]),
    stockPorId: new Map([
      ["fila-katana", { id: "fila-katana", etiqueta: "Katana", cantidad: 0 }],
      ["fila-funda", { id: "fila-funda", etiqueta: "Funda sin receta", cantidad: 0 }],
    ]),
    modelosStockeados: new Set(["k"]),
    variantes: new Map([["con", { nombre: "Con Funda", afectaStock: false }]]),
    modelos: new Map([["k", "Katana"]]),
    reglas: new Map([["k", [{ requiere: ["con"], stockId: "fila-funda", cantidad: 1 }]]]),
  };
  const receta = { bodegaModelId: "b", nombre: "Katana", gramos: 300, segundos: 36000, insumos: 0, precioKg: null };
  const armado: ContextoDePrecios = {
    general: cx.general,
    reservas,
    costos: new Map([["fila-katana", { stockId: "fila-katana", etiqueta: "Katana", fab: 7000, insumos: 0, total: 7000, receta, insumosSinDeclarar: false }]]),
    bodegaDeFila: new Map([["fila-katana", "b"], ["fila-funda", "bf"]]),
    piezas: new Map(),
  };
  const con = precioDeCombinacion({ id: "c1", modeloId: "k", nombre: "Katana · Con Funda", sku: null, variantes: ["con"] }, armado);
  ok(con.precios === null && con.falta.some((f) => f.motivo === "insumo_sin_costo" && f.etiqueta === "Funda sin receta"), "la Con Funda queda sin precio", con.falta);
  const sola = precioDeCombinacion({ id: "c2", modeloId: "k", nombre: "Katana", sku: null, variantes: [] }, armado);
  ok(sola.precios !== null && sola.falta.length === 0, "la katana sola sí tiene precio", sola.falta);

  const reales = ps.filter((p) => p.falta.some((f) => f.motivo === "insumo_sin_costo"));
  ok(reales.every((p) => p.precios === null), "en los datos de verdad, ninguna con insumo sin costo tiene precio");
  for (const p of reales) console.log(`  · ${p.nombre}: falta ${p.falta.map((f) => f.etiqueta).join(", ")}`);
}

function rn4() {
  console.log("RN-4 · precio de venta del ERP");
  const combo = (nombre: string, variantes: string[], personalizado: number | null): PrecioDeCombinacion => ({
    ...combinacionDePrueba({ personalizado: personalizado ?? 0 }, "noventa", nombre),
    combinacionId: nombre,
    variantes,
    precios: personalizado == null ? null : combinacionDePrueba({ personalizado }).precios,
  });
  const katana = [combo("Sin Funda", ["sin"], 25490), combo("Con Funda", ["con"], 32690)];
  const r = precioDeVentaErp("m", katana);
  ok(r.precioVenta === 25490 && r.base === "Sin Funda", "la base es la más barata", r);
  ok(r.adicionales.find((a) => a.varianteId === "con")?.precioAdicional === 7200, "Con Funda suma la diferencia", r.adicionales);
  ok(r.adicionales.find((a) => a.varianteId === "sin")?.precioAdicional === 0, "la opción de la base suma 0");
  ok(r.desvios.length === 0, "sin desvíos con un solo grupo");

  const sinUna = precioDeVentaErp("m", [...katana, combo("Con Exhibidor", ["exh"], null)]);
  ok(sinUna.precioVenta === null && sinUna.falta.includes("Con Exhibidor"), "si falta una activa no se propone nada", sinUna);

  const solo = precioDeVentaErp("m", [combo("Ajedrez", [], 39590)]);
  ok(solo.precioVenta === 39590 && solo.adicionales.length === 0, "un producto simple vale su combinación", solo);
}

async function main() {
  const cx = await cargarContextoDePrecios(T);
  const [ps, costos] = await Promise.all([preciosDeCombinaciones(T, {}, cx), costosPorFilaDeStock(T)]);
  console.log(`${ps.length} combinaciones activas, ${ps.filter((p) => p.precios).length} con precio. Gastos ${cx.general.deBodega ? "de Bodega" : "medidos (Bodega no subió los suyos)"}.\n`);
  await ca1(ps);
  await ca2(ps, cx, costos);
  ca3();
  ca4(cx, ps);
  rn4();
  console.log(`\n${fallas ? `✗ ${fallas} de ${pruebas} fallaron` : `✓ ${pruebas} de ${pruebas}`}`);
  process.exitCode = fallas ? 1 : 0;
}

main().finally(() => prisma.$disconnect());
