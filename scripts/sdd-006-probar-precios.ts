/**
 * docs/sdd/006 — pruebas puras de la fórmula: la promo sin cruzar $30.000 (spec 003, RN-6) y los
 * descuentos por cantidad de la web (spec 009).
 *
 *   npx tsx scripts/sdd-006-probar-precios.ts
 *
 * No lee la base: los gastos son los de hoy escritos a mano.
 */
import {
  descuentosParaMargen,
  GASTOS_MEDIDOS,
  margenesDeTramos,
  precioConMargen,
  precioConPromo,
  redondear,
  techoDeRedondeo,
  type GastosVenta,
} from "@/lib/precios-formula";

let pruebas = 0;
let fallas = 0;
function ok(cond: boolean, que: string, detalle?: unknown) {
  pruebas++;
  if (!cond) fallas++;
  console.log(`${cond ? "✓" : "✗"} ${que}${!cond && detalle !== undefined ? ` — ${JSON.stringify(detalle)}` : ""}`);
}

const g: GastosVenta = {
  ...GASTOS_MEDIDOS,
  margenMinorista: 35,
  mlPromoPct: 10,
  mlEnvioDesde: 30000,
  webCobroPct: 1.6,
  webPublicidadPct: 5,
  iibbPct: 4,
  webEnvioGratisDesde: 34000,
  webEnvioCosto: 6315,
};

// Spec 003, RN-6.
const techo = techoDeRedondeo(g, "ml", 28000);
ok(precioConPromo(28000, 10, techo).publicado === 28000, "CA-3: $28.000 con promo 10 % se publica sin promo", precioConPromo(28000, 10, techo));
ok(precioConPromo(26000, 10, techoDeRedondeo(g, "ml", 26000)).publicado === 28889, "CA-3: $26.000 se publica a $28.889", precioConPromo(26000, 10, techoDeRedondeo(g, "ml", 26000)));
ok(precioConPromo(40000, 10, techoDeRedondeo(g, "ml", 40000)).publicado === 44445, "arriba del umbral la promo se aplica", precioConPromo(40000, 10, undefined));

// Spec 009. Las metas que se pidieron primero; descuentosParaMargen sirve para cualquiera.
const METAS = [{ desde: 5, margen: 30 }, { desde: 10, margen: 25 }, { desde: 20, margen: 20 }];
const sinEnvio: GastosVenta = { ...g, webEnvioGratisDesde: Number.MAX_SAFE_INTEGER };
const costos: Array<[number, number]> = [[1500, 0], [3200, 800], [6000, 0], [9000, 2500], [15000, 0]];
for (const [fab, ins] of costos) {
  for (const [nombre, gx] of [["con envío", g], ["sin envío", sinEnvio]] as const) {
    const crudo = precioConMargen(gx, "web", fab, ins).recomendado.precio;
    const lista = redondear(crudo, "noventa", techoDeRedondeo(gx, "web", crudo));
    const ds = descuentosParaMargen(gx, lista, fab, ins, METAS);
    ok(ds.every((d) => (d.llega ? d.margen >= d.meta - 1e-9 : d.descuento === 0)), `CA-1 ${nombre}, costo ${fab}+${ins}: cada tramo llega a su meta (o queda en 0 % y lo dice)`, ds);
    const masUno = descuentosParaMargen(gx, lista, fab, ins, METAS).map((d, i) => {
      const t = METAS[i];
      const p = lista * (1 - (d.descuento + 1) / 100);
      const envio = gx.webEnvioGratisDesde <= p * t.desde ? gx.webEnvioCosto / t.desde : 0;
      return (p * (1 - 0.106) - fab - ins - envio) / p * 100 < t.margen;
    });
    ok(masUno.every(Boolean), `CA-2 ${nombre}, costo ${fab}+${ins}: un punto más ya no llega`, ds.map((d) => d.descuento));
  }
}
// Con gastos sólo porcentuales, el precio de lista exacto (sin redondeo) y sin envío: 8 / 15 / 21.
for (const fab of [2000, 7000, 12000]) {
  const lista = precioConMargen(sinEnvio, "web", fab, 0).recomendado.precio;
  const ds = descuentosParaMargen(sinEnvio, lista, fab, 0, METAS).map((d) => d.descuento);
  ok(ds.join("/") === "8/15/21", `CA-3: costo ${fab} sin envío da 8 / 15 / 21`, ds);
}

// Los tramos elegidos (8 / 12 / 18 %), con envío gratis desde $40.000 y reserva de 3 %.
{
  const gx: GastosVenta = { ...g, webEnvioGratisDesde: 40000, webEnvioReservaPct: 3 };
  const [cinco] = margenesDeTramos(gx, 10000, 4000, 0);
  // 5 × $9.200 = $46.000 pasa el umbral: el envío va repartido en 5, y la reserva no es gasto.
  const esperado = ((9200 * (1 - 0.106) - 4000 - 6315 / 5) / 9200) * 100;
  ok(Math.abs(cinco.margen - esperado) < 1e-9 && cinco.envioPorUnidad === 6315 / 5, "tramo de 5 u de $10.000 con 8 %", cinco);
  const [chico] = margenesDeTramos(gx, 5000, 2000, 0);
  ok(chico.envioPorUnidad === 0, "5 u de $5.000 no pasa el umbral: el envío lo paga el cliente", chico);
}

console.log(`\n${fallas ? `✗ ${fallas} de ${pruebas} fallaron` : `✓ ${pruebas} de ${pruebas}`}`);
process.exitCode = fallas ? 1 : 0;
