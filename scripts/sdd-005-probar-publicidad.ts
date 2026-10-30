/**
 * docs/sdd/005 — prueba de las reglas de Publicidad (TASK-003).
 *
 *   npx tsx scripts/sdd-005-probar-publicidad.ts
 *
 * Sólo las funciones puras: margen, ROAS mínimo, períodos, alertas, la revisión de cambios y las
 * recomendaciones (spec 004). No toca la base ni Mercado Libre.
 */
import { GASTOS_MEDIDOS } from "@/lib/precios-formula";
import type { FilaAnuncio, FilaCampana } from "@/lib/publicidad-ml";
import { recomendaciones } from "@/lib/publicidad-recomendaciones";
import {
  alertasDe,
  gananciaAntesDePublicidad,
  rangoDe,
  revisarCambioAnuncio,
  revisarCambioCampana,
  roasMinimo,
  roasQueAsumeElPrecio,
} from "@/lib/publicidad-reglas";

let pruebas = 0;
let fallas = 0;
function ok(cond: boolean, que: string, detalle?: unknown) {
  pruebas++;
  if (cond) return;
  fallas++;
  console.log(`  ✗ ${que}`, detalle === undefined ? "" : JSON.stringify(detalle));
}
const cerca = (a: number | null, b: number) => a != null && Math.abs(a - b) < 0.01;

// Margen (spec 001, RN-1): $22.500 de precio y $4.407 de costo con los gastos medidos.
// 18,9 % (11,3 + 3,1 + 0,5 + 4) del precio, $1.053 fijos, sin envío por estar bajo $30.000.
const g = GASTOS_MEDIDOS;
ok(cerca(gananciaAntesDePublicidad(g, 22500, 4407), 22500 * 0.811 - 1053 - 4407), "margen bajo el umbral del envío");
ok(cerca(gananciaAntesDePublicidad(g, 40000, 8000), 40000 * 0.811 - 1053 - 9900 - 8000), "margen con envío");
ok(cerca(roasMinimo(100, 25), 4), "ROAS mínimo = precio / ganancia");
ok(roasMinimo(100, 0) === null && roasMinimo(100, -5) === null, "sin ganancia no hay ROAS mínimo");
ok(cerca(roasQueAsumeElPrecio(g), 100 / 15.8), "ROAS que asume el precio");

// Períodos.
const hoy = new Date(2026, 9, 26);
ok(JSON.stringify(rangoDe("7d", hoy)) === JSON.stringify({ desde: "2026-10-20", hasta: "2026-10-26" }), "7 días con hoy", rangoDe("7d", hoy));
ok(JSON.stringify(rangoDe("mes-pasado", hoy)) === JSON.stringify({ desde: "2026-09-01", hasta: "2026-09-30" }), "mes pasado", rangoDe("mes-pasado", hoy));
ok(rangoDe("mes", new Date(2026, 0, 1)).desde === "2026-01-01", "este mes el día 1");

// Alertas (spec 001, REQ-5).
const tipos = (a: ReturnType<typeof alertasDe>) => a.map((x) => x.tipo).join(",");
ok(tipos(alertasDe({ gasto: 6000, ventas: 0, roasMinimo: 2, activa: true })) === "sin-ventas", "gastó sin vender");
ok(tipos(alertasDe({ gasto: 3000, ventas: 0, roasMinimo: 2, activa: true })) === "", "poco gasto sin ventas no alerta");
ok(tipos(alertasDe({ gasto: 10000, ventas: 15000, roasMinimo: 2, activa: true })) === "pierde", "ROAS debajo del mínimo");
ok(tipos(alertasDe({ gasto: 10000, ventas: 50000, roasMinimo: 2, activa: true, perdidoPorPresupuesto: 0.2 })) === "presupuesto", "rinde y pierde por presupuesto");
ok(tipos(alertasDe({ gasto: 10000, ventas: 15000, roasMinimo: 2, activa: true, perdidoPorPresupuesto: 0.2 })) === "pierde", "no sugiere presupuesto si pierde plata");
ok(tipos(alertasDe({ gasto: 10000, ventas: 50000, roasMinimo: 2, activa: false, perdidoPorPresupuesto: 0.2 })) === "", "pausada no pide presupuesto");

// Cambios de campaña (spec 002).
const actual = { budget: 1000, status: "active", roas_target: 3, strategy: "profitability" };
const ctx = { esShay: false, ultimoCambio: null, ahora: hoy };
let r = revisarCambioCampana(actual, { budget: 1100 }, ctx);
ok(!r.errores.length && r.envio.budget === 1100 && !r.avisos.length, "+10 % de presupuesto sin avisos", r);
r = revisarCambioCampana(actual, { budget: 1600 }, ctx);
ok(r.avisos.some((a) => a.aparte), "+60 % pide confirmación aparte (RN-2)", r.avisos);
r = revisarCambioCampana(actual, { roas_target: 40 }, ctx);
ok(r.errores.length === 1, "ROAS 40 no pasa (RN-1, CA-2)", r.errores);
r = revisarCambioCampana(actual, { roas_target: 0.5 }, ctx);
ok(r.errores.length === 1, "ROAS 0,5 no pasa (CA-2)", r.errores);
r = revisarCambioCampana(actual, { budget: 0 }, ctx);
ok(r.errores.length === 1, "presupuesto cero no pasa", r.errores);
r = revisarCambioCampana(actual, { budget: 1000, roas_target: 3 }, ctx);
ok(r.errores[0] === "No hay nada que cambiar.", "lo mismo no se manda", r.errores);
r = revisarCambioCampana(actual, { strategy: "visibility", status: "paused" }, ctx);
ok(r.envio.strategy === "visibility" && r.envio.status === "paused" && r.envio.budget === undefined, "sólo se manda lo que cambia", r.envio);
r = revisarCambioCampana(actual, { strategy: "mucho" }, ctx);
ok(r.errores.length === 1, "estrategia desconocida no pasa");
r = revisarCambioCampana(actual, { budget: 1100 }, { ...ctx, esShay: true });
ok(r.avisos.some((a) => a.aparte && /Shay/.test(a.texto)), "Shay pide confirmación aparte (RN-3)");
r = revisarCambioCampana(actual, { budget: 1100 }, { ...ctx, ultimoCambio: new Date(2026, 9, 24) });
ok(r.avisos.some((a) => !a.aparte && /aprendizaje/.test(a.texto)), "cambiada hace 2 días avisa (RN-4)", r.avisos);
r = revisarCambioCampana(actual, { budget: 1100 }, { ...ctx, ultimoCambio: new Date(2026, 9, 1) });
ok(!r.avisos.length, "cambiada hace semanas no avisa");

// Cambios de anuncio.
const campanas = new Map([
  [1, { nombre: "Uno", esShay: false }],
  [2, { nombre: "Dos", esShay: false }],
  [9, { nombre: "De Shay", esShay: true }],
]);
let ra = revisarCambioAnuncio({ status: "IDLE", campaign_id: 0 }, { campaign_id: 1 }, { campanas });
ok(ra.envio.campaign_id === 1 && ra.envio.status === "active" && ra.cambios[0].antes === "Sin campaña", "agregar a una campaña", ra);
ra = revisarCambioAnuncio({ status: "PAUSED", campaign_id: 1 }, { campaign_id: 2 }, { campanas });
ok(ra.envio.status === "paused", "mover conserva el estado pausado", ra.envio);
ra = revisarCambioAnuncio({ status: "ACTIVE", campaign_id: 1 }, { campaign_id: 9 }, { campanas });
ok(ra.avisos.some((a) => a.aparte), "mover a una de Shay pide confirmación aparte");
ra = revisarCambioAnuncio({ status: "ACTIVE", campaign_id: 1 }, { campaign_id: 77 }, { campanas });
ok(ra.errores.length === 1, "campaña que no existe no pasa");
ra = revisarCambioAnuncio({ status: "ACTIVE", campaign_id: 1 }, { status: "paused" }, { campanas });
ok(ra.envio.status === "paused" && ra.envio.campaign_id === undefined, "pausar un anuncio");

// Recomendaciones (spec 004).
const anuncio = (o: Partial<FilaAnuncio>): FilaAnuncio => ({
  id: 1, campanaId: 10, titulo: "Anuncio", foto: null, estado: "ACTIVE", tipo: "FAMILY", publicaciones: [{ mla: "MLA1", enlace: null, precio: 20000 }],
  gasto: 0, ventas: 0, unidades: 0, clics: 0, impresiones: 0, roas: null,
  costo: { precio: 20000, costo: 4000, ganancia: 10000, roasMinimo: 2, fuente: "bodega", modeloId: "m1" },
  gananciaEstimada: null, alertas: [], ...o,
});
const campana = (o: Partial<FilaCampana>): FilaCampana => ({
  id: 10, nombre: "Campaña", estado: "active", estrategia: "profitability", roasObjetivo: 3, presupuesto: 2000, esShay: false,
  gasto: 20000, ventas: 80000, unidades: 4, clics: 200, impresiones: 50000, roas: 4, roasMinimo: 2, gananciaEstimada: 20000,
  cobertura: 1, perdidoPorPresupuesto: 0, perdidoPorRanking: 0, ultimoCambio: null, modificadaEnMl: null, alertas: [], anuncios: [], ...o,
});
const claves = (r: ReturnType<typeof recomendaciones>) => r.map((x) => x.clave.replace(/-[0-9]+$/, "")).join(",");

let rr = recomendaciones([campana({ anuncios: [anuncio({ gasto: 8000, clics: 40, ventas: 0 })] })], []);
ok(claves(rr) === "pausar-anuncio" && rr[0].pedido?.tipo === "anuncio", "anuncio que gasta sin vender se pausa", rr);
rr = recomendaciones([campana({ anuncios: [anuncio({ gasto: 8000, clics: 5, ventas: 0 })] })], []);
ok(claves(rr) === "", "con 5 clics no hay conclusión", rr);
rr = recomendaciones([campana({ anuncios: [anuncio({ gasto: 8000, clics: 40, ventas: 10000, roas: 1.25, gananciaEstimada: -3000 })] })], []);
ok(claves(rr) === "pausar-anuncio", "anuncio que vende a pérdida clara se pausa", rr);
rr = recomendaciones([campana({ estado: "paused", anuncios: [anuncio({ gasto: 8000, clics: 40 })] })], []);
ok(claves(rr) === "", "en una campaña pausada no se recomienda nada", rr);
rr = recomendaciones([campana({ esShay: true, roasObjetivo: 1, anuncios: [anuncio({ gasto: 8000, clics: 40 })] })], []);
ok(claves(rr) === "", "las de Shay no se tocan", rr);
rr = recomendaciones([campana({ roasObjetivo: 1.5, roasMinimo: 2 })], []);
ok(claves(rr) === "roas-objetivo" && rr[0].pedido?.tipo === "campana" && (rr[0].pedido.cambios as { roas_target: number }).roas_target === 2.5, "ROAS objetivo debajo del mínimo: subirlo a mínimo × 1,25", rr);
rr = recomendaciones([campana({ roasObjetivo: 1.5, roasMinimo: 2, ultimoCambio: new Date().toISOString() })], []);
ok(claves(rr) === "", "cambiada hace poco: se espera", rr);
rr = recomendaciones([campana({ roas: 1.5, roasMinimo: 2, roasObjetivo: 2.5 })], []);
ok(claves(rr) === "bajar-presupuesto" && (rr[0].pedido?.cambios as { budget: number }).budget === 1400, "pierde con buen objetivo: −30 % de presupuesto", rr);
rr = recomendaciones([campana({ roas: 0, ventas: 0, roasMinimo: 2, roasObjetivo: 2.5 })], []);
ok(claves(rr) === "pausar-campana", "gastó sin vender: pausar la campaña", rr);
rr = recomendaciones([campana({ perdidoPorPresupuesto: 0.3 })], []);
ok(claves(rr) === "subir-presupuesto" && (rr[0].pedido?.cambios as { budget: number }).budget === 2500, "rinde y le falta presupuesto: +25 %", rr);
rr = recomendaciones([campana({ perdidoPorPresupuesto: 0.3, roas: 2.2 })], []);
ok(claves(rr) === "", "sin holgura sobre el mínimo no se sube", rr);
rr = recomendaciones([campana({ gasto: 3000, perdidoPorPresupuesto: 0.3 })], []);
ok(claves(rr) === "", "con poco gasto no se concluye", rr);
rr = recomendaciones([], [anuncio({ campanaId: 0, costo: { precio: 10000, costo: 9000, ganancia: -500, roasMinimo: null, fuente: "bodega", modeloId: "m9" } })]);
ok(claves(rr) === "precio" && rr[0].ir != null && "href" in rr[0].ir && rr[0].ir.href === "/precios?modelo=m9", "precio que no cierra va a Precios", rr);
rr = recomendaciones([], [anuncio({ campanaId: 0 }), anuncio({ id: 2, campanaId: 0, costo: null })]);
ok(claves(rr) === "sumar-publicaciones" && rr[0].titulo.includes("1 publicación"), "sin campaña con buen margen: sumarlas", rr);
rr = recomendaciones([campana({ perdidoPorPresupuesto: 0.3, anuncios: [anuncio({ gasto: 8000, clics: 40 })] })], []);
ok(rr[0].grave && !rr[1].grave, "lo grave va primero", rr.map((x) => x.clave));

console.log(`${pruebas - fallas} de ${pruebas}`);
process.exitCode = fallas ? 1 : 0;
