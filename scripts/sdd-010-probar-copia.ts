/**
 * docs/sdd/010 — pruebas puras del copiador de publicaciones entre cuentas de ML: el título y los
 * atributos.
 *
 *   npx tsx scripts/sdd-010-probar-copia.ts
 *
 * No lee la base ni ML.
 */
import { atributosParaCopiar, LARGO_MAXIMO, problemasDelTitulo, reemplazarFinal, type AtributoMl } from "@/lib/copiar-ml-reglas";

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

// Los atributos, con las formas reales que ML rechazó el 2026-11-12.
{
  const de = (a: AtributoMl[]) => atributosParaCopiar(a);
  const uno = (a: AtributoMl) => JSON.stringify(de([a]));
  ok(uno({ id: "CHARACTER", value_id: "76631791", value_name: "Tokito Muichiro", value_type: "string", values: [{ id: "76631791", name: "Tokito Muichiro", struct: null }] }) === '[{"id":"CHARACTER","value_name":"Tokito Muichiro"}]', "un texto va por nombre: el código puede ser de la cuenta principal", uno({ id: "CHARACTER", value_id: "76631791", value_name: "Tokito Muichiro", value_type: "string" }));
  ok(uno({ id: "HEIGHT", value_id: "1016242", value_name: "10 cm", value_type: "number_unit", values: [{ id: "1016242", name: "10 cm", struct: { number: 10, unit: "cm" } }] }) === '[{"id":"HEIGHT","value_name":"10 cm"}]', "una medida va como texto con unidad, sin el código");
  ok(uno({ id: "MIN_RECOMMENDED_AGE", value_id: "3582452", value_name: null, value_type: "number_unit", values: [{ id: "3582452", name: null, struct: { number: 2, unit: "años" } }] }) === '[{"id":"MIN_RECOMMENDED_AGE","value_name":"2 años"}]', "sin nombre, la medida sale del número y la unidad");
  ok(uno({ id: "MIN_RECOMMENDED_AGE", value_id: "-1", value_name: null, value_type: "number_unit" }) === '[{"id":"MIN_RECOMMENDED_AGE","value_id":"-1"}]', "\"No aplica\" va tal cual");
  ok(de([{ id: null, name: "Color", value_name: "Negro", value_type: "string" }, { id: "", value_name: "x" }]).length === 0, "sin id no se copia");
  ok(de([{ id: "FILTRABLE_RECOMMENDED_AGE_GROUP", value_name: "6 a 8 años,9 a 13 años", value_type: "list" }, { id: "PACKAGE_WEIGHT", value_name: "50 g", value_type: "number_unit" }]).length === 0, "lo que calcula ML no se copia");
  ok(uno({ id: "MAIN_COLOR", value_id: "2450311", value_name: "Violeta", value_type: "color" }) === '[{"id":"MAIN_COLOR","value_id":"2450311","value_name":"Violeta"}]', "un color de lista va con código y nombre: la otra cuenta puede no conocer el código");
  ok(uno({ id: "IS_KIT", value_id: "242084", value_name: null, value_type: "boolean" }) === '[{"id":"IS_KIT","value_id":"242084"}]', "sí/no sin nombre va por código");
  ok(uno({ id: "SELLER_PACKAGE_HEIGHT", value_id: null, value_name: "20 cm", value_type: "number_unit" }) === '[{"id":"SELLER_PACKAGE_HEIGHT","value_name":"20 cm"}]', "el paquete del vendedor sí se copia");
  ok(uno({ id: "SUITABLE_FOR", value_id: null, value_name: "A,B", value_type: "list", values: [{ id: "1", name: "A" }, { id: "2", name: "B" }] }) === '[{"id":"SUITABLE_FOR","values":[{"id":"1","name":"A"},{"id":"2","name":"B"}]}]', "con varios valores, van todos");
  ok(uno({ id: "BRAND", value_id: null, value_name: null, value_type: "string", values: [] }) === "[]", "sin valor no se manda");
  const colchon = new Map([["MATTRESS_SIZE", [{ id: "11590766", name: "1 plaza" }, { id: "1387960", name: "2 plazas" }]]]);
  const viejo: AtributoMl = { id: "MATTRESS_SIZE", value_id: "11609364", value_name: "2 plazas", value_type: "list" };
  ok(JSON.stringify(atributosParaCopiar([viejo], colchon)) === '[{"id":"MATTRESS_SIZE","value_id":"1387960","value_name":"2 plazas"}]', "un código que la categoría ya no tiene se cambia por el vigente con el mismo nombre", atributosParaCopiar([viejo], colchon));
  ok(JSON.stringify(atributosParaCopiar([{ ...viejo, value_name: "Cucheta" }], colchon)) === '[{"id":"MATTRESS_SIZE","value_name":"Cucheta"}]', "si no hay ninguno con ese nombre, va sólo el nombre");
  ok(JSON.stringify(atributosParaCopiar([{ ...viejo, value_id: "1387960" }], colchon)) === '[{"id":"MATTRESS_SIZE","value_id":"1387960","value_name":"2 plazas"}]', "un código vigente queda igual");
  ok(JSON.stringify(atributosParaCopiar([viejo])) === '[{"id":"MATTRESS_SIZE","value_id":"11609364","value_name":"2 plazas"}]', "sin los valores de la categoría, va el de la original");
}

console.log(`\n${fallas ? `✗ ${fallas} de ${pruebas} fallaron` : `✓ ${pruebas} de ${pruebas}`}`);
process.exitCode = fallas ? 1 : 0;
