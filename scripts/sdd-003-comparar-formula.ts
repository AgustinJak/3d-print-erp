/**
 * docs/sdd/003 — la copia de la fórmula da lo mismo que Bodega (TASK-007).
 *
 *   npx tsx scripts/sdd-003-comparar-formula.ts
 *
 * Corre `src/lib/precios-bodega.ts` y los originales de Bodega (`../Bodega/Bodega3D-App`) sobre una
 * grilla de fabricación, insumos, gastos, márgenes, redondeos y promos, incluido el cruce del
 * umbral de envío, y compara todo lo que devuelven. Falla con la primera diferencia. Se corre en
 * cada release de Bodega, después de `sdd-003-copiar-formula.ts`.
 *
 * Bodega se importa con una ruta armada en tiempo de ejecución: el repo del ERP se compila solo en
 * Vercel, sin Bodega al lado, y un import estático rompería el build.
 */
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { pathToFileURL } from "url";
import * as erp from "@/lib/precios-bodega";

type Formula = typeof erp;

const BODEGA = resolve("..", "Bodega", "Bodega3D-App");
const LIB = resolve(BODEGA, "src", "renderer", "src", "lib");

/** Igualdad exacta, con NaN igual a NaN e Infinity distinguido de null. */
function igual(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") return Object.is(a, b) || a === b;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object).sort();
  const kb = Object.keys(b as object).sort();
  if (ka.join() !== kb.join()) return false;
  return ka.every((k) => igual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

async function main() {
  if (!existsSync(LIB)) throw new Error(`no está el repo de Bodega en ${BODEGA}`);
  const bodega = { ...(await import(pathToFileURL(resolve(LIB, "precios.ts")).href)), ...(await import(pathToFileURL(resolve(LIB, "politica.ts")).href)) } as Formula;

  const version = JSON.parse(readFileSync(resolve(BODEGA, "package.json"), "utf8")).version as string;
  const copia = readFileSync(resolve("src", "lib", "precios-bodega.ts"), "utf8").match(/Copia de Bodega ([\d.]+)/)?.[1];
  if (copia !== version) console.warn(`⚠ la copia dice Bodega ${copia} y Bodega está en ${version}: correr sdd-003-copiar-formula.ts`);

  // Lo exportado tiene que ser lo mismo, salvo lo que la copia deja afuera a propósito.
  const afuera = new Set(["preciosDeImpresion", "materialDe", "leerFoto"]);
  const nombresBodega = Object.keys(bodega).filter((k) => !afuera.has(k)).sort();
  const nombresErp = Object.keys(erp).sort();
  if (nombresBodega.join() !== nombresErp.join()) {
    throw new Error(`exportan distinto.\n  Bodega: ${nombresBodega.join(", ")}\n  ERP:    ${nombresErp.join(", ")}`);
  }

  const G = erp.GASTOS_MEDIDOS;
  const gastos: Array<[string, erp.GastosVenta]> = [
    ["medidos", G],
    ["sin cuotas", { ...G, mlCuotasPct: 0 }],
    ["caros", { ...G, mlComisionPct: 16, mlPublicidadPct: 20, iibbPct: 5, webCobroPct: 6 }],
    ["imposible", { ...G, mlComisionPct: 40, mlPublicidadPct: 30 }],
    ["umbral bajo", { ...G, mlEnvioDesde: 12000, webEnvioGratisDesde: 15000 }],
  ];
  const fabricaciones = [0, 350, 1234.56, 3000, 5200, 8000, 12000, 18500, 26000, 40000];
  const insumos = [0, 800, 5000, 15000];
  const margenes = [null, 30, 45, 55, 70];
  const promos = [null, 0, 5, 15];
  const redondeos = erp.REDONDEOS.map((r) => r.id);

  let casos = 0;
  const comparar = (que: string, f: (x: Formula) => unknown) => {
    casos++;
    const a = f(bodega);
    const b = f(erp);
    if (!igual(a, b)) {
      throw new Error(`difieren en ${que}\n  Bodega: ${JSON.stringify(a)}\n  ERP:    ${JSON.stringify(b)}`);
    }
  };

  for (const [nombre, g] of gastos) {
    for (const fab of fabricaciones) {
      for (const ins of insumos) {
        const donde = `${nombre}, fab ${fab}, ins ${ins}`;
        comparar(`pisoPorMayorista (${donde})`, (x) => x.pisoPorMayorista(g, fab, ins));
        comparar(`precioMl (${donde})`, (x) => x.precioMl(g, fab, ins));
        for (const canal of ["ml", "web", "personalizado"] as const) {
          comparar(`precioPara ${canal} (${donde})`, (x) => x.precioPara(g, canal, fab, ins));
          comparar(`precioConGanancia ${canal} (${donde})`, (x) => x.precioConGanancia(g, canal, fab, ins, 7000));
          comparar(`margenDe ${canal} (${donde})`, (x) => x.margenDe(g, canal, 29990, fab, ins));
        }
        comparar(`preciosMayoristas (${donde})`, (x) => x.preciosMayoristas(g, 30000, fab, ins));
        comparar(`descuentoMaximo (${donde})`, (x) => x.descuentoMaximo(g, 30000, fab, ins, 40));
        for (const margen of margenes) {
          for (const promo of promos) {
            for (const redondeo of redondeos) {
              const politica = { margen, promo, redondeo: margen === 45 ? null : redondeo };
              const caso = `${donde}, margen ${margen}, promo ${promo}, redondeo ${redondeo}`;
              comparar(`aplicarPolitica (${caso})`, (x) => x.aplicarPolitica(g, erp.REDONDEO_POR_DEFECTO, politica));
              const p = erp.aplicarPolitica(g, erp.REDONDEO_POR_DEFECTO, politica);
              comparar(`preciosPorCanal (${caso})`, (x) => x.preciosPorCanal(p.gastos, fab, ins, p.redondeo));
              comparar(`tresPrecios (${caso})`, (x) => x.tresPrecios(p.gastos, fab, ins, p.redondeo));
            }
          }
        }
      }
    }
  }

  // Las piezas sueltas, con los bordes que tienen ramas propias.
  for (const precio of [-5, 0, 99, 100, 101, 500, 1000, 21204, 21290, 29950, 29990, 29999, 30001, 35000, 127961, Infinity, NaN]) {
    for (const modo of redondeos) {
      for (const techo of [undefined, 29999, 33999]) {
        comparar(`redondear ${precio} ${modo} ${techo}`, (x) => x.redondear(precio, modo, techo));
      }
    }
    for (const promo of [0, 5, 15, 100]) {
      for (const techo of [undefined, 29999]) {
        comparar(`precioConPromo ${precio} ${promo} ${techo}`, (x) => x.precioConPromo(precio, promo, techo));
      }
    }
    for (const canal of ["ml", "web", "personalizado"] as const) {
      comparar(`techoDeRedondeo ${canal} ${precio}`, (x) => x.techoDeRedondeo(G, canal, precio));
      comparar(`desgloseEn ${canal} ${precio}`, (x) => x.desgloseEn(G, canal, precio));
    }
  }
  const mapas: Array<Record<string, string>> = [{}, { precio_mlComisionPct: "13.5", precio_margenMinorista: "60" }, { precio_iibbPct: "no" }];
  for (const map of mapas) {
    comparar(`gastosFromMap ${JSON.stringify(map)}`, (x) => x.gastosFromMap(map));
  }
  for (const m of [{}, { margen: 50, redondeo: "mil", promoMl: 10 }, { margen: NaN, redondeo: "raro", promoMl: null }]) {
    comparar(`politicaDeModelo ${JSON.stringify(m)}`, (x) => x.politicaDeModelo(m));
  }
  for (const v of ["noventa", "mil", "x", 3, null]) comparar(`esRedondeo ${v}`, (x) => x.esRedondeo(v));
  for (const k of ["GASTOS_MEDIDOS", "TRAMOS_MAYORISTA", "REDONDEOS", "TOLERANCIA_MARGEN", "SIN_POLITICA", "REDONDEO_POR_DEFECTO"] as const) {
    comparar(k, (x) => x[k]);
  }

  console.log(`✓ Bodega ${version} y la copia del ERP dan lo mismo en ${casos.toLocaleString("es-AR")} casos.`);
}

main().catch((e) => {
  console.error(`✗ ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
