/**
 * docs/sdd/013 — pruebas puras del cotizador rápido.
 *
 *   npx tsx scripts/sdd-013-probar-cotizador.ts
 */
import { cotizar } from "@/lib/cotizador";
import { fabricacionDeReceta } from "@/lib/costos-formula";
import { GASTOS_MEDIDOS } from "@/lib/precios-formula";

let pruebas = 0;
let fallas = 0;
function ok(cond: boolean, que: string, detalle?: unknown) {
  pruebas++;
  if (!cond) fallas++;
  console.log(`${cond ? "✓" : "✗"} ${que}${cond || detalle === undefined ? "" : `\n    ${JSON.stringify(detalle)}`}`);
}

// Los parámetros de Bodega del 2026-11-16.
const P = { precioKg: 18000, precioKwh: 220, consumoW: 100, desgasteHoras: 4320, precioRepuestos: 150000, margenError: 20 };
const G = { ...GASTOS_MEDIDOS, margenMinorista: 35, mlPromoPct: 10 };

// 100 g y 5 h: material 1.800, luz 110, desgaste 173,6; con 20 % = 2.500,3
const c = cotizar({ gramos: 100, minutos: 300, precioKg: null, insumos: 0, margen: null }, P, G, "exacto");
ok(Math.abs(c.fabricacion.material - 1800) < 0.01 && Math.abs(c.fabricacion.luz - 110) < 0.01, "material y luz como en Bodega", c.fabricacion);
ok(Math.abs(c.fabricacion.total - fabricacionDeReceta(P, 100, 18000)) < 0.001, "el total es la misma fórmula que usa el ERP con las recetas de Bodega");
for (const k of c.canales) ok(Math.abs(k.margen - 35) < 1, `${k.nombre}: deja el 35 % del precio`, { precio: k.precio, margen: k.margen });
const ml = c.canales.find((k) => k.canal === "ml")!;
ok(ml.publicado > ml.precio, "en ML se publica inflado por la promo", ml);
ok(c.canales.find((k) => k.canal === "personalizado")!.gastos.length === 0, "la venta directa no lleva comisiones ni IIBB");

// El material elegido cambia el costo.
const silk = cotizar({ gramos: 100, minutos: 300, precioKg: 21990, insumos: 0, margen: null }, P, G, "exacto");
ok(Math.abs(silk.fabricacion.material - 2199) < 0.01, "con otro material, su precio por kilo");

// Insumos y margen propio.
const conInsumos = cotizar({ gramos: 100, minutos: 300, precioKg: null, insumos: 1500, margen: 50 }, P, G, "exacto");
ok(conInsumos.costo - c.costo === 1500, "los insumos suman al costo");
// En ML puede quedar hasta 2 puntos abajo: el motor prefiere no cruzar el umbral del envío (TOLERANCIA_MARGEN).
ok(conInsumos.canales.every((k) => k.margen > 48 - 0.01 && k.margen < 50.5), "con margen propio del 50 % (ML hasta 2 puntos menos por el envío)", conInsumos.canales.map((k) => k.margen));

// Redondeo a $100.
const r = cotizar({ gramos: 100, minutos: 300, precioKg: null, insumos: 0, margen: null }, P, G, "cien");
ok(r.canales.every((k) => k.precio % 100 === 0), "con redondeo a $100", r.canales.map((k) => k.precio));

// Vacío: sin precios.
const vacio = cotizar({ gramos: 0, minutos: 0, precioKg: null, insumos: 0, margen: null }, P, G, "exacto");
ok(vacio.canales.every((k) => k.precio === 0), "sin datos no inventa precios");

console.log(`\n${fallas ? `✗ ${fallas} de ${pruebas} fallaron` : `✓ ${pruebas} de ${pruebas}`}`);
process.exitCode = fallas ? 1 : 0;
