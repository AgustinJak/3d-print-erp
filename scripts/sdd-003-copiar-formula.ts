/**
 * docs/sdd/003 — copia la fórmula de precios de Bodega al ERP (TASK-007).
 *
 *   npx tsx scripts/sdd-003-copiar-formula.ts
 *   npx tsx scripts/sdd-003-comparar-formula.ts
 *
 * Arma `src/lib/precios-bodega.ts` con `precios.ts` y la parte de precios de `politica.ts` de
 * Bodega, sin tocar una línea de lógica. Necesita el repo de Bodega al lado del ERP, como está en
 * la PC de Agustín (`../Bodega/Bodega3D-App`). Si un marcador no aparece, frena: quiere decir que
 * Bodega reordenó el archivo y hay que mirar a mano qué cambió.
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const BODEGA = resolve("..", "Bodega", "Bodega3D-App");
const DESTINO = resolve("src", "lib", "precios-bodega.ts");

const leer = (ruta: string) => readFileSync(resolve(BODEGA, ruta), "utf8").replace(/\r\n/g, "\n");

/** Saca desde `desde` hasta antes de `hasta` (o hasta el final). */
function quitar(s: string, desde: string, hasta: string | null): string {
  const i = s.indexOf(desde);
  if (i < 0) throw new Error(`falta el marcador "${desde.slice(0, 50)}"`);
  const j = hasta == null ? s.length : s.indexOf(hasta, i);
  if (j < 0) throw new Error(`falta el marcador "${hasta!.slice(0, 50)}"`);
  return s.slice(0, i) + s.slice(j);
}

const version = JSON.parse(leer("package.json")).version as string;

// precios.ts: sin el import de calc y tipos ni `preciosDeImpresion`, que es lo único que los usa.
let precios = leer("src/renderer/src/lib/precios.ts");
const imports = "import type { CostSettings, CostInputs } from '../types'\nimport { calcCost } from './calc'\n\n";
if (!precios.startsWith(imports)) throw new Error("cambiaron los imports de precios.ts");
precios = quitar(precios.slice(imports.length), "/** Atajo: de los datos de impresión al precio", "export function gastosFromMap");

// politica.ts: sin el import, sin `materialDe` (usa el tipo Material) y sin la foto guardada.
let politica = leer("src/renderer/src/lib/politica.ts");
const inicio = politica.indexOf("/**\n * La política de precio de un modelo");
if (inicio < 0) throw new Error("falta el comienzo de politica.ts");
politica = quitar(politica.slice(inicio), "/** El material de un modelo:", "export interface TresPrecios");
politica = quitar(politica, "/** Lo que queda guardado en el modelo al tocar", null);

const encabezado = `/**
 * La fórmula de precios de Bodega, copiada tal cual (docs/sdd/003, TASK-007).
 *
 * Copia de Bodega ${version}: \`src/renderer/src/lib/precios.ts\` entero salvo \`preciosDeImpresion\`
 * (el atajo desde gramos y horas; acá la fabricación ya viene de \`costos-bodega.ts\`) y, al final,
 * la política del modelo y \`tresPrecios\` de \`src/renderer/src/lib/politica.ts\`.
 *
 * No se edita a mano: lo arma \`scripts/sdd-003-copiar-formula.ts\`, con el estilo de Bodega para
 * que un diff contra el original muestre sólo lo que cambió allá. Después de copiar se corre
 * \`npx tsx scripts/sdd-003-comparar-formula.ts\`, que falla si las dos dan distinto.
 */

`;
const separador = "\n// ─── De politica.ts ─────────────────────────────────────────────────────────\n\n";
writeFileSync(DESTINO, encabezado + precios.trimEnd() + "\n" + separador + politica.trimEnd() + "\n");
console.log(`Bodega ${version} → src/lib/precios-bodega.ts`);
