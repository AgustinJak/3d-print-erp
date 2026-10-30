/**
 * docs/sdd/006, spec 010 — pruebas puras de las reglas de promos de ML.
 *
 *   npx tsx scripts/sdd-006-probar-promos.ts
 *
 * Los datos de ML son los que contestó para el Carrete (MLA3189980034) el 2026-10-30.
 */
import {
  activaDe,
  avisosDe,
  candidatasDe,
  normalizarPromo,
  pedidoAMl,
  precioParaPct,
  promoEsperada,
  quedo,
  quedoEnPromos,
  rangoDe,
} from "@/lib/promos-ml-reglas";

let pruebas = 0;
let fallas = 0;
function ok(cond: boolean, que: string, detalle?: unknown) {
  pruebas++;
  if (!cond) fallas++;
  console.log(`${cond ? "✓" : "✗"} ${que}${!cond && detalle !== undefined ? ` — ${JSON.stringify(detalle)}` : ""}`);
}

const carrete = [
  { id: "C-MLA1710245", type: "SELLER_CAMPAIGN", sub_type: "FLEXIBLE_PERCENTAGE", status: "started", price: 3610, original_price: 3800, start_date: "2026-10-08T00:00:00", finish_date: "2026-11-07T23:59:59", name: "Q4" },
  { id: "P-MLA18145042", type: "DEAL", status: "pending", price: 3501.7, original_price: 3800, name: "MKP T1 CYBER MONDAY NOV" },
  { type: "PRICE_DISCOUNT", status: "candidate", price: 0, original_price: 3800, name: "", min_discounted_price: 1225.6, max_discounted_price: 3610, suggested_discounted_price: 3610 },
  { id: "C-MLA1716484", type: "SELLER_COUPON_CAMPAIGN", sub_type: "FIXED_PERCENTAGE", fixed_percentage: 15, status: "candidate", price: 0, original_price: 3800, name: "Cupón para carritos abandonados" },
  { id: "LGH-1", type: "LIGHTNING", status: "candidate", price: 0, original_price: 3800, name: "Relámpago" },
].map(normalizarPromo);

const activa = activaDe(carrete);
ok(activa?.id === "C-MLA1710245" && activa.precio === 3610, "la activa es Q4 a $3.610", activa);
const cand = candidatasDe(carrete);
ok(cand.length === 2 && !cand.some((c) => c.tipo === "LIGHTNING"), "candidatas: descuento propio y cupón; relámpago no se prende desde el ERP", cand.map((c) => c.tipo));
ok(JSON.stringify(rangoDe(cand[0], 3800)) === JSON.stringify({ pide: 5, deja: 67.7 }), "el descuento propio pide 5 % y deja hasta 67,7 %", rangoDe(cand[0], 3800));
ok(rangoDe(cand[1], 3800).pide === 15, "el cupón es 15 % fijo");

// La promo que supone el precio (spec 003, RN-6).
ok(promoEsperada(3800, 10, 30000) === 10, "un producto barato supone 10 %");
ok(promoEsperada(31112, 10, 30000) === 0, "publicado $31.112 que el cliente pagaría $28.000: sin promo");
ok(promoEsperada(53878, 10, 30000) === 10, "arriba de $30.000 con su margen: 10 %");

// Avisos.
const ahora = new Date("2026-10-30T12:00:00Z");
ok(avisosDe(10, activa, 3800, ahora)[0]?.tipo === "distinta", "Q4 al 5 % contra 10 % esperado: % distinto");
ok(avisosDe(10, null, 3800, ahora)[0]?.tipo === "sin-promo", "sin promo activa: sin campaña");
ok(avisosDe(0, activa, 3800, ahora)[0]?.tipo === "de-mas", "con promo y precio sin inflar: promo de más");
ok(avisosDe(5, activa, 3800, ahora).length === 0, "5 % esperado y 5 % activo: nada que avisar");
ok(avisosDe(5, activa, 3800, new Date("2026-11-06T12:00:00Z")).some((a) => a.tipo === "vence"), "vence en menos de 3 días");

// Precio para un %.
ok(precioParaPct(cand[0], 3800, 10).precio === 3420, "10 % del Carrete: $3.420");
const poco = precioParaPct(cand[0], 3800, 2);
ok(poco.precio === 3610 && !!poco.ajustado, "2 % no lo deja ML: se usa $3.610 (5 %) y lo dice", poco);
ok(precioParaPct(cand[1], 3800, 10).precio === null, "un cupón no tiene precio");

// Lo que se manda.
const put = pedidoAMl({ mla: "MLA3189980034", accion: "cambiar", promocionId: "C-MLA1710245", promocionTipo: "SELLER_CAMPAIGN", precio: 3420 }, null);
ok(
  "metodo" in put && put.metodo === "PUT" && put.path === "/seller-promotions/items/MLA3189980034?app_version=v2" && JSON.stringify(put.cuerpo) === JSON.stringify({ promotion_type: "SELLER_CAMPAIGN", promotion_id: "C-MLA1710245", deal_price: 3420 }),
  "cambiar el % en una campaña propia: PUT con deal_price (lo que se probó con el Carrete)",
  put
);
const del = pedidoAMl({ mla: "MLA1", accion: "sacar", promocionId: "C-1", promocionTipo: "SELLER_CAMPAIGN", precio: null }, null);
ok("metodo" in del && del.metodo === "DELETE" && del.path.includes("promotion_type=SELLER_CAMPAIGN") && del.path.includes("promotion_id=C-1"), "sacar: DELETE con tipo e id", del);
const pd = pedidoAMl({ mla: "MLA1", accion: "sumar", promocionId: null, promocionTipo: "PRICE_DISCOUNT", precio: 3420 }, null, ahora);
ok("metodo" in pd && pd.metodo === "POST" && pd.cuerpo?.start_date === "2026-10-30T12:00:00" && pd.cuerpo?.finish_date === "2026-11-29T12:00:00", "descuento propio: POST con fechas por un mes", pd);
ok("error" in pedidoAMl({ mla: "MLA1", accion: "sumar", promocionId: "P-1", promocionTipo: "SMART", precio: null }, null), "co-participación sin oferta de ML: no se manda");
ok("error" in pedidoAMl({ mla: "MLA1", accion: "sumar", promocionId: "L-1", promocionTipo: "LIGHTNING", precio: 100 }, null), "relámpago: se prende en ML");
const cupon = pedidoAMl({ mla: "MLA1", accion: "sumar", promocionId: "C-MLA1716484", promocionTipo: "SELLER_COUPON_CAMPAIGN", precio: null }, null);
ok("metodo" in cupon && cupon.cuerpo?.deal_price === undefined, "un cupón va sin precio", cupon);

// Co-participación: ML pone el precio y parte del descuento (una katana, 2026-10-30).
const smart = normalizarPromo({ id: "P-MLA18161080", type: "SMART", ref_id: "CANDIDATE-MLA1636503035-71691833514", status: "candidate", price: 51604, meli_percentage: 2.4, seller_percentage: 37.7, original_price: 86212, name: "Ofertas compartidas CM" });
const ps = precioParaPct(smart, 86212, 10);
ok(ps.precio === 51604 && ps.pct === 40.1 && ps.ajustado === "ML pone 2.4 %, vos 37.7 %", "co-participación: el precio es el de ML y dice quién pone cuánto", ps);
const ms = pedidoAMl({ mla: "MLA1636503035", accion: "sumar", promocionId: smart.id, promocionTipo: "SMART", precio: ps.precio }, smart.ofertaId);
ok("metodo" in ms && ms.cuerpo?.offer_id === "CANDIDATE-MLA1636503035-71691833514" && ms.cuerpo?.deal_price === undefined, "co-participación: se acepta con la oferta, sin precio", ms);

// Verificación con lo que paga el cliente.
const pedidoPut = { mla: "MLA3189980034", accion: "cambiar" as const, promocionId: "C-MLA1710245", promocionTipo: "SELLER_CAMPAIGN", precio: 3420 };
ok(quedo(pedidoPut, 3420, 3800), "paga $3.420 después: quedó");
ok(!quedo(pedidoPut, 3610, 3800), "sigue pagando $3.610: no cambió (lo que pasó con el POST)");
ok(quedo({ ...pedidoPut, accion: "sacar", precio: null }, 3800, 3800), "sacar: paga el precio entero");

// La Ichigo (2026-10-30): de "Q44" a "Q4" al mismo 10 %. Lo que paga no cambia; la lista sí.
const ichigo = [
  { id: "C-MLA1749392", type: "SELLER_CAMPAIGN", status: "started", price: 89290.8, original_price: 99212, name: "Q44" },
  { id: "C-MLA1710245", type: "SELLER_CAMPAIGN", status: "started", price: 89291, original_price: 99212, name: "Q4" },
].map(normalizarPromo);
const sumarQ4 = { mla: "MLA1651421029", accion: "sumar" as const, promocionId: "C-MLA1710245", promocionTipo: "SELLER_CAMPAIGN", precio: 89291 };
ok(quedoEnPromos(sumarQ4, ichigo), "sumada a Q4: aparece en la lista");
ok(!quedoEnPromos(sumarQ4, ichigo.slice(0, 1)), "si sólo está Q44, no se sumó aunque pague lo mismo");
ok(quedoEnPromos({ ...sumarQ4, accion: "sacar", promocionId: "C-MLA1716484" }, ichigo), "sacar de una campaña donde ya no está: quedó");

console.log(`\n${fallas ? `✗ ${fallas} de ${pruebas} fallaron` : `✓ ${pruebas} de ${pruebas}`}`);
process.exitCode = fallas ? 1 : 0;
