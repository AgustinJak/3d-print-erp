/**
 * docs/sdd/010 — pruebas puras del copiador de publicaciones entre cuentas de ML: el título.
 *
 *   npx tsx scripts/sdd-010-probar-copia.ts
 *
 * No lee la base ni ML.
 */
import { LARGO_MAXIMO, problemasDelTitulo, reemplazarFinal } from "@/lib/copiar-ml-reglas";

let pruebas = 0;
let fallas = 0;
function ok(cond: boolean, que: string, detalle?: unknown) {
  pruebas++;
  if (!cond) fallas++;
  console.log(`${cond ? "✓" : "✗"} ${que}${cond || detalle === undefined ? "" : `\n    ${JSON.stringify(detalle)}`}`);
}

const original = "Base Porta Auriculares Vincha Gamer Modelo De Acdc";
ok(problemasDelTitulo(original, original).some((p) => p.startsWith("Es igual")), "igual al original: no se crea");
ok(problemasDelTitulo(original, "  base porta auriculares vincha gamer modelo de ACDC ").some((p) => p.startsWith("Es igual")), "mayúsculas y espacios no lo hacen distinto");
ok(problemasDelTitulo("Katana Tanjiro Edición", "Katana Tanjiro Edicion").some((p) => p.startsWith("Es igual")), "los acentos tampoco");
ok(problemasDelTitulo(original, reemplazarFinal(original, 2, "AC DC Rock")).length === 0, "con la última parte cambiada, pasa", problemasDelTitulo(original, reemplazarFinal(original, 2, "AC DC Rock")));
ok(problemasDelTitulo(original, "x".repeat(LARGO_MAXIMO + 1)).some((p) => p.includes(`máximo es ${LARGO_MAXIMO}`)), "más de 60 letras: no");
ok(problemasDelTitulo(original, "Base Porta Auriculares Impresión 3D").some((p) => p.includes("no va de cara al cliente")), "palabras que no van de cara al cliente: no");
ok(problemasDelTitulo(original, "").some((p) => p === "Falta el título."), "vacío: no");

ok(reemplazarFinal("Uno Dos Tres Cuatro", 1, "Cinco") === "Uno Dos Tres Cinco", "reemplaza la última palabra");
ok(reemplazarFinal("Uno Dos Tres Cuatro", 2, "Cinco Seis") === "Uno Dos Cinco Seis", "reemplaza las últimas dos");
ok(reemplazarFinal("Uno Dos", 0, "Tres") === "Uno Dos Tres", "con 0, agrega al final");
ok(reemplazarFinal("Uno", 3, "Dos") === "Dos", "si pide más palabras de las que hay, queda sólo lo nuevo");

console.log(`\n${fallas ? `✗ ${fallas} de ${pruebas} fallaron` : `✓ ${pruebas} de ${pruebas}`}`);
process.exitCode = fallas ? 1 : 0;
