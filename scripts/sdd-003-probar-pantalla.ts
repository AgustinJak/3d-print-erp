/**
 * docs/sdd/003 — la pantalla de Precios y el canal ERP (TASK-010), contra la spec 004.
 *
 *   npx tsx --env-file=.env scripts/sdd-003-probar-pantalla.ts
 *
 * Todo en un tenant aislado que se borra al final, pase lo que pase. Las piezas son tres
 * "ZZ Prueba Claude" en bodega.models (una pieza de stock apunta a una sola pieza de Bodega), con
 * la receta copiada de la katana y la funda de Tokito; también se borran al final. No llama a
 * Mercado Libre: las claves de ML son de mentira y sólo se prueban las que no se pueden aplicar.
 *
 * - CA-1: la fila muestra publicado → propuesto con la diferencia en pesos y en %.
 * - CA-3: una combinación sin costo no se puede aplicar y dice qué falta.
 * - CA-4: un cambio de más de 30 % no se aplica sin la confirmación aparte.
 * - RN-5 / spec 003 RN-4: aplicar en el ERP escribe el precio de venta y los adicionales, con
 *   historial; aplicar dos veces no cambia nada; un precio que ya no es el propuesto no se manda.
 * - spec 005 RN-3: cerrada, en revisión, automatizada, con variaciones, en promoción o con una
 *   lectura vieja no se escribe.
 */
import { prisma } from "@/lib/prisma";
import { crearGrupo } from "@/lib/catalogo";
import { motivoMl, type LecturaMl } from "@/lib/precios-ml";
import { aplicarPrecios, armarPropuesta } from "@/lib/precios-propuesta";
import { PREFIJO_FALTA } from "@/lib/precios-reglas";

const T = "prueba-claude-precios";
const PREFIJO = "ZZ Prueba Claude";
const PIEZAS = { katana: "zz-prueba-claude-precios-katana", funda: "zz-prueba-claude-precios-funda", sinReceta: "zz-prueba-claude-precios-sin-receta" };
let fallas = 0;
let pruebas = 0;
function ok(cond: boolean, que: string, detalle?: unknown) {
  pruebas++;
  console.log(`${cond ? "✔" : "✘"} ${que}${!cond && detalle !== undefined ? ` ${JSON.stringify(detalle)}` : ""}`);
  if (!cond) fallas++;
}

async function limpiar() {
  await prisma.cambioPrecio.deleteMany({ where: { tenantId: T } });
  await prisma.reservaStock.deleteMany({ where: { tenantId: T } });
  await prisma.mapeoCanal.deleteMany({ where: { tenantId: T } });
  await prisma.reglaInsumo.deleteMany({ where: { tenantId: T } });
  await prisma.combinacion.deleteMany({ where: { tenantId: T } });
  await prisma.stock.deleteMany({ where: { tenantId: T } });
  await prisma.modelo.deleteMany({ where: { tenantId: T } });
  await prisma.$executeRaw`DELETE FROM bodega.models WHERE id LIKE 'zz-prueba-claude-precios-%'`;
}

/** Una pieza de prueba en Bodega con la receta de una pieza de verdad (o sin receta). */
async function piezaDeBodega(id: string, nombre: string, copiaDe: string | null) {
  if (!copiaDe) {
    await prisma.$executeRaw`INSERT INTO bodega.models (id, name, category) VALUES (${id}, ${PREFIJO + " " + nombre}, null)`;
    return;
  }
  const n = await prisma.$executeRaw`
    INSERT INTO bodega.models (id, name, category, filament_grams, print_time_seconds, insumos, material_id)
    SELECT ${id}, ${PREFIJO + " " + nombre}, null, m.filament_grams, m.print_time_seconds, m.insumos, m.material_id
      FROM bodega.models m JOIN stock s ON s.bodega_model_id = m.id
     WHERE s.tenant_id = 'sendero3d' AND s.etiqueta = ${copiaDe} AND m.filament_grams IS NOT NULL
     LIMIT 1`;
  if (n !== 1) throw new Error(`no está la receta de "${copiaDe}" en Bodega`);
}

const lectura = (cambios: Partial<LecturaMl> = {}): LecturaMl => ({
  estado: "active",
  subEstado: [],
  paga: null,
  promo: null,
  automatizada: false,
  variaciones: 0,
  catalogo: false,
  ...cambios,
});

async function main() {
  await limpiar();
  await piezaDeBodega(PIEZAS.katana, "Katana", "Tokito Katana 95cm");
  await piezaDeBodega(PIEZAS.funda, "Funda", "Funda 95cm Demon Slayer");
  await piezaDeBodega(PIEZAS.sinReceta, "Sin receta", null);
  const [katanaBodega, fundaBodega, sinRecetaBodega] = [PIEZAS.katana, PIEZAS.funda, PIEZAS.sinReceta];

  // Una katana con funda, y un producto cuya pieza Bodega no costeó.
  const funda = await prisma.modelo.create({ data: { tenantId: T, nombre: "Funda de prueba", esInsumo: true, activo: false } });
  const filaFunda = await prisma.stock.create({ data: { tenantId: T, modeloId: funda.id, clave: `${funda.id}|`, etiqueta: "Funda de prueba", bodegaModelId: fundaBodega } });
  const katana = await prisma.modelo.create({ data: { tenantId: T, nombre: "Katana de prueba", sku: "SS-PRU-KAT-001" } });
  await prisma.stock.create({ data: { tenantId: T, modeloId: katana.id, clave: `${katana.id}|`, etiqueta: "Katana de prueba", bodegaModelId: katanaBodega } });
  await crearGrupo(T, katana.id, { nombre: "Funda", tipo: "insumo", insumoStockId: filaFunda.id });
  const sinReceta = await prisma.modelo.create({ data: { tenantId: T, nombre: "Sin receta de prueba" } });
  await prisma.stock.create({ data: { tenantId: T, modeloId: sinReceta.id, clave: `${sinReceta.id}|`, etiqueta: "Sin receta de prueba", bodegaModelId: sinRecetaBodega } });
  await prisma.combinacion.create({ data: { tenantId: T, modeloId: sinReceta.id, clave: `${sinReceta.id}|`, nombre: "Sin receta de prueba", variantes: [] } });

  const combos = await prisma.combinacion.findMany({ where: { tenantId: T, modeloId: katana.id, activo: true }, select: { id: true, nombre: true, variantes: true } });
  const con = combos.find((c) => /con funda/i.test(c.nombre))!;
  const sin = combos.find((c) => /sin funda/i.test(c.nombre))!;
  const comboSinReceta = await prisma.combinacion.findFirstOrThrow({ where: { tenantId: T, modeloId: sinReceta.id } });

  // Primera vuelta, para saber los propuestos y armar las claves alrededor.
  let p = await armarPropuesta(T);
  const pCon = p.combinaciones.find((c) => c.combinacionId === con.id)!;
  const pSin = p.combinaciones.find((c) => c.combinacionId === sin.id)!;
  ok(!!pCon.precios && !!pSin.precios, "la katana con y sin funda tienen precio");
  const mlCon = pCon.precios!.mlPublicado;

  const ahora = new Date();
  const vieja = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const publicadoCa1 = Math.round(mlCon / 1.083);
  await prisma.mapeoCanal.createMany({
    data: [
      // CA-1: se puede aplicar (no se aplica: es una publicación de mentira).
      { tenantId: T, canal: "mercadolibre", clave: "MLA-PRUEBA-1|", combinacionId: con.id, precioPublicado: publicadoCa1, precioLeidoEn: ahora, precioLectura: lectura() as object },
      { tenantId: T, canal: "mercadolibre", clave: "MLA-PRUEBA-2|", combinacionId: sin.id, precioPublicado: 1000, precioLeidoEn: ahora, precioLectura: lectura({ promo: { id: "OFFER-X", tipo: "custom", campania: "C-X" } }) as object },
      { tenantId: T, canal: "mercadolibre", clave: "MLA-PRUEBA-3|", combinacionId: sin.id, precioPublicado: 1000, precioLeidoEn: vieja, precioLectura: lectura() as object },
      { tenantId: T, canal: "mercadolibre", clave: "MLA-PRUEBA-4|", combinacionId: null, precioPublicado: 1000, precioLeidoEn: ahora, precioLectura: lectura() as object },
      { tenantId: T, canal: "mercadolibre", clave: "MLA-PRUEBA-5|", combinacionId: comboSinReceta.id, precioPublicado: 1000, precioLeidoEn: ahora, precioLectura: lectura() as object },
      // Dos variaciones de una misma publicación a combinaciones con precios distintos.
      { tenantId: T, canal: "mercadolibre", clave: "MLA-PRUEBA-6|111", combinacionId: con.id, precioPublicado: 1000, precioLeidoEn: ahora, precioLectura: lectura() as object },
      { tenantId: T, canal: "mercadolibre", clave: "MLA-PRUEBA-6|222", combinacionId: sin.id, precioPublicado: 1000, precioLeidoEn: ahora, precioLectura: lectura() as object },
      { tenantId: T, canal: "shop", clave: "prod-prueba|", combinacionId: con.id },
    ],
  });

  console.log("\n— La propuesta —");
  p = await armarPropuesta(T);
  const fila = (clave: string) => p.canales.find((f) => f.clave === clave)!;
  const f1 = fila("MLA-PRUEBA-1|");
  ok(f1.motivo === null && f1.publicado === publicadoCa1 && f1.propuesto === mlCon, `CA-1: ${f1.publicado} → ${f1.propuesto}`, f1);
  ok(Math.abs(f1.pct! - 8.3) < 0.1 && f1.diferencia === mlCon - publicadoCa1, `CA-1: diferencia ${f1.diferencia} (${f1.pct?.toFixed(1)} %)`);
  ok(fila("MLA-PRUEBA-2|").motivo?.startsWith("promoción activa") === true, "en promoción no se puede aplicar (spec 005, RN-3)");
  ok(fila("MLA-PRUEBA-3|").motivo?.startsWith("lectura de más de una hora") === true, "una lectura vieja no se puede aplicar (RN-2)");
  ok(fila("MLA-PRUEBA-4|").motivo === "falta mapear", "sin combinación: falta mapear");
  const f5 = fila("MLA-PRUEBA-5|");
  ok(f5.motivo?.startsWith(PREFIJO_FALTA) === true && f5.propuesto === null && f5.motivo.includes("gramos y tiempo"), `CA-3: dice qué falta: "${f5.motivo}"`);
  ok(fila("MLA-PRUEBA-6|111").motivo === "precios distintos en la misma publicación", "dos variaciones con precios distintos no se escriben (spec 005, CA-3)");
  ok(fila("prod-prueba|").motivo?.includes("spec 006") === true && fila("prod-prueba|").propuesto === pCon.precios!.web, "la web propone el precio web y espera el endpoint del Shop");

  const erp = p.erp.find((f) => f.modeloId === katana.id)!;
  const adicionalCon = erp.adicionales.find((a) => a.varianteId === con.variantes[0])!;
  ok(erp.propuesto === pSin.precios!.personalizado, `ERP: precio de venta = personalizados de Sin Funda (${erp.propuesto})`);
  ok(adicionalCon.propuesto === pCon.precios!.personalizado - pSin.precios!.personalizado, `ERP: Con Funda suma la diferencia (${adicionalCon.propuesto})`);
  const erpSinReceta = p.erp.find((f) => f.modeloId === sinReceta.id)!;
  ok(erpSinReceta.propuesto === null && erpSinReceta.motivo?.startsWith(PREFIJO_FALTA) === true, "ERP: sin costo no se propone (CA-3)");

  console.log("\n— Aplicar en el ERP —");
  // Precio de hoy a menos de 30 % del propuesto: no pide la confirmación aparte.
  await prisma.modelo.update({ where: { id: katana.id }, data: { precioVenta: Math.round(erp.propuesto! * 0.9) } });
  p = await armarPropuesta(T);
  let e = p.erp.find((f) => f.modeloId === katana.id)!;
  let r = await aplicarPrecios(T, "prueba", "erp", [{ clave: katana.id, precio: e.propuesto! + 500 }], false);
  ok(r[0].estado === "rechazado" && r[0].mensaje!.includes("la propuesta cambió"), `un precio que no es el propuesto no se manda: "${r[0].mensaje}"`);
  r = await aplicarPrecios(T, "prueba", "erp", [{ clave: katana.id, precio: e.propuesto! }], false);
  const m = await prisma.modelo.findUniqueOrThrow({ where: { id: katana.id }, include: { variantes: true } });
  const vCon = m.variantes.find((v) => v.id === con.variantes[0])!;
  ok(r[0].estado === "aplicado" && m.precioVenta === e.propuesto, `aplicado: precio de venta ${m.precioVenta}`);
  ok(vCon.precioAdicional === adicionalCon.propuesto, `y el adicional de Con Funda: ${vCon.precioAdicional}`);
  const historial = await prisma.cambioPrecio.findMany({ where: { tenantId: T, canal: "erp" } });
  ok(historial.length === 2 && historial.every((h) => h.estado === "aplicado" && h.usuario === "prueba"), `historial: ${historial.map((h) => `${h.clave.slice(0, 12)} ${h.antes}→${h.despues}`).join(", ")}`);
  r = await aplicarPrecios(T, "prueba", "erp", [{ clave: katana.id, precio: e.propuesto! }], false);
  ok(r[0].estado === "sin_cambios" && (await prisma.cambioPrecio.count({ where: { tenantId: T } })) === 2, "aplicar dos veces no cambia nada (doble click)");

  console.log("\n— Cambios de más de 30 % (CA-4) —");
  await prisma.modelo.update({ where: { id: katana.id }, data: { precioVenta: Math.round(e.propuesto! / 1.4) } });
  p = await armarPropuesta(T);
  e = p.erp.find((f) => f.modeloId === katana.id)!;
  r = await aplicarPrecios(T, "prueba", "erp", [{ clave: katana.id, precio: e.propuesto! }], false);
  ok(r[0].estado === "rechazado" && r[0].mensaje!.includes("confirmarlo aparte"), `+${e.pct?.toFixed(0)} % sin confirmar: "${r[0].mensaje}"`);
  r = await aplicarPrecios(T, "prueba", "erp", [{ clave: katana.id, precio: e.propuesto! }], true);
  ok(r[0].estado === "aplicado", "con la confirmación aparte, sí");

  console.log("\n— ML: lo que no se puede aplicar no se manda —");
  r = await aplicarPrecios(
    T,
    "prueba",
    "mercadolibre",
    ["MLA-PRUEBA-2|", "MLA-PRUEBA-3|", "MLA-PRUEBA-4|", "MLA-PRUEBA-5|", "MLA-PRUEBA-6|111"].map((clave) => ({ clave, precio: 1 })),
    true
  );
  ok(r.every((x) => x.estado === "rechazado"), `las cinco rechazadas sin llamar a ML: ${r.map((x) => x.mensaje?.slice(0, 30)).join(" | ")}`);
  ok((await prisma.cambioPrecio.count({ where: { tenantId: T, canal: "mercadolibre" } })) === 0, "y no dejan historial de escritura");
  let err: unknown = null;
  await aplicarPrecios(T, "prueba", "shop", [{ clave: "prod-prueba|", precio: 1 }], true).catch((x) => (err = x));
  ok(err instanceof Error && err.message.includes("spec 006"), "la web no se aplica hasta que esté el endpoint del Shop");

  console.log("\n— Cuándo no se escribe en ML (spec 005, RN-3) —");
  const t = new Date();
  ok(motivoMl(lectura(), t) === null, "activa, sin promo ni automatización: se puede");
  ok(motivoMl(lectura({ estado: "paused" }), t) === null, "pausada: se puede (nadie la ve)");
  ok(motivoMl(lectura({ automatizada: true }), t)?.includes("automatización") === true, "con automatización de precios: no (CA-2)");
  ok(motivoMl(lectura({ automatizada: null }), t)?.includes("no se pudo verificar") === true, "sin saber si está automatizada: no");
  ok(motivoMl(lectura({ estado: "closed" }), t) === "publicación cerrada", "cerrada: no");
  ok(motivoMl(lectura({ subEstado: ["waiting_for_patch"] }), t) === "publicación en revisión", "en revisión: no");
  ok(motivoMl(lectura({ variaciones: 2 }), t)?.includes("variaciones") === true, "con variaciones: no, hasta probarlo");
  ok(motivoMl(null, null)?.startsWith("sin leer") === true, "sin leer: no");

  console.log(`\n${fallas ? `✘ ${fallas} de ${pruebas} fallaron` : `✔ ${pruebas} de ${pruebas}`}`);
  process.exitCode = fallas ? 1 : 0;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await limpiar();
    await prisma.$disconnect();
  });
