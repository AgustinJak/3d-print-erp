/**
 * docs/sdd/015 — pruebas de los ajustes de precio por producto.
 *
 *   npx tsx --env-file=.env --env-file=.env.local --tsconfig tsconfig.json scripts/sdd-015-probar-ajustes.ts
 *
 * Primero las reglas (puras). Después, contra la base real: un producto con precio, se le ponen
 * ajustes, se mira que el precio cambie como debe, y se borran al final.
 */
import { prisma } from "@/lib/prisma";
import { conPorcentaje, resumir, textoDeAjuste, validarAjuste, vigente, type Ajuste } from "@/lib/ajustes-precio-reglas";
import { borrarAjuste, guardarAjuste } from "@/lib/ajustes-precio";
import { cargarContextoDePrecios, preciosDeCombinaciones } from "@/lib/precios-combinacion";
import { vistaPreviaAjuste } from "@/lib/ajustes-precio-vista";

let pruebas = 0;
let fallas = 0;
function ok(cond: boolean, que: string, detalle?: unknown) {
  pruebas++;
  if (!cond) fallas++;
  console.log(`${cond ? "✓" : "✗"} ${que}${cond || detalle === undefined ? "" : `\n    ${JSON.stringify(detalle)}`}`);
}

const ahora = new Date("2026-11-18T12:00:00-03:00");
const a = (x: Partial<Ajuste>): Ajuste => ({ canal: "web", tipo: "porcentaje", valor: 3, hasta: null, nota: null, ...x });

ok(conPorcentaje(10000, 3) === 10300 && conPorcentaje(10000, -5) === 9500 && conPorcentaje(10000, undefined) === 10000, "el % sube, baja o no toca");
ok(vigente({ hasta: null }, ahora) && vigente({ hasta: "2026-11-30T23:59:00-03:00" }, ahora) && !vigente({ hasta: "2026-11-17T00:00:00-03:00" }, ahora), "sin fecha y a futuro valen; vencido no");
const r = resumir([a({}), a({ canal: "ml", valor: -5 }), a({ tipo: "envio", canal: "ml", valor: 12000 }), a({ canal: "personalizado", hasta: "2026-11-01T00:00:00-03:00" })], ahora);
ok(r.pct.web === 3 && r.pct.ml === -5 && r.envio.ml === 12000 && r.pct.personalizado === undefined, "el resumen toma lo vigente y deja afuera lo vencido", r);
ok(!!validarAjuste({ canal: "personalizado", tipo: "envio", valor: 100 }), "la venta directa no lleva envío");
ok(!!validarAjuste({ canal: "web", tipo: "porcentaje", valor: -95 }), "no se puede bajar 95 %");
ok(validarAjuste({ canal: "web", tipo: "porcentaje", valor: 3, hasta: "2026-11-30" }) === null, "un +3 % web con fecha está bien");
ok(textoDeAjuste(a({ hasta: "2026-11-30T23:59:00-03:00" }), ahora) === "+3 % web · hasta 30/11", "la etiqueta dice \"+3 % web · hasta 30/11\"", textoDeAjuste(a({ hasta: "2026-11-30T23:59:00-03:00" }), ahora));
ok(textoDeAjuste(a({ hasta: "2026-11-10T12:00:00-03:00" }), ahora).includes("venció"), "un vencido lo dice");

async function contraLaBase() {
  const cx = await cargarContextoDePrecios("sendero3d");
  const todas = await preciosDeCombinaciones("sendero3d", {}, cx);
  // Un producto con una sola combinación con precio y sin ajustes ni precio fijo de ML.
  const porModelo = new Map<string, typeof todas>();
  for (const c of todas) porModelo.set(c.modeloId, [...(porModelo.get(c.modeloId) ?? []), c]);
  const yaAjustados = new Set((await prisma.ajustePrecio.findMany({ select: { modeloId: true } })).map((x) => x.modeloId));
  const elegido = [...porModelo.entries()].find(
    ([id, l]) => l.length === 1 && l[0].precios && !yaAjustados.has(id) && cx.erp?.modelos.get(id)?.precioMlFijo == null
  );
  if (!elegido) return console.log("sin producto para probar");
  const [modeloId, [antes]] = elegido;
  console.log(`\nproducto: ${antes.modelo} · ML ${antes.precios!.mlPublicado} · web ${antes.precios!.web} · directa ${antes.precios!.personalizado}`);

  try {
    const vp = await vistaPreviaAjuste("sendero3d", { modeloIds: [modeloId], canal: "web", tipo: "porcentaje", valor: 3 });
    const fila = "filas" in vp ? vp.filas[0] : null;
    ok(!!fila && fila.nuevo!.web > fila.hoy!.web && fila.nuevo!.ml === fila.hoy!.ml, "la vista previa sube sólo la web", vp);
    ok(!(await prisma.ajustePrecio.findFirst({ where: { modeloId } })), "la vista previa no guarda nada");

    await guardarAjuste("sendero3d", "prueba", { modeloIds: [modeloId], canal: "web", tipo: "porcentaje", valor: 3, nota: "PRUEBA SDD 015" });
    await guardarAjuste("sendero3d", "prueba", { modeloIds: [modeloId], canal: "ml", tipo: "porcentaje", valor: 10, nota: "PRUEBA SDD 015" });
    await guardarAjuste("sendero3d", "prueba", { modeloIds: [modeloId], canal: "personalizado", tipo: "porcentaje", valor: -5, nota: "PRUEBA SDD 015" });
    const cx2 = await cargarContextoDePrecios("sendero3d");
    const [despues] = await preciosDeCombinaciones("sendero3d", { modeloIds: [modeloId] }, cx2);
    const p0 = antes.precios!;
    const p1 = despues.precios!;
    console.log(`con ajustes: ML ${p1.mlPublicado} (paga ${p1.ml}) · web ${p1.web} · directa ${p1.personalizado}`);
    const cerca = (x: number, y: number, tol: number) => Math.abs(x - y) <= tol;
    ok(cerca(p1.web, p0.web * 1.03, 100), "la web sube ~3 % (con su redondeo)", { antes: p0.web, despues: p1.web });
    ok(cerca(p1.ml, p0.ml * 1.1, 100) && p1.mlPublicado > p0.mlPublicado, "ML sube ~10 % y lo publicado también", { antes: [p0.ml, p0.mlPublicado], despues: [p1.ml, p1.mlPublicado] });
    ok(p1.personalizado < p0.personalizado, "la venta directa baja", { antes: p0.personalizado, despues: p1.personalizado });
    ok(p1.ganancia === p0.ganancia, "la ganancia que se copia entre canales no cambia", { antes: p0.ganancia, despues: p1.ganancia });

    // Vencido: deja de aplicarse solo.
    await prisma.ajustePrecio.updateMany({ where: { modeloId }, data: { hasta: new Date(Date.now() - 60_000) } });
    const [vencido] = await preciosDeCombinaciones("sendero3d", { modeloIds: [modeloId] }, await cargarContextoDePrecios("sendero3d"));
    ok(vencido.precios!.web === p0.web && vencido.precios!.mlPublicado === p0.mlPublicado, "vencidos, los precios vuelven a los de antes");

    // Envío propio en la web.
    await prisma.ajustePrecio.deleteMany({ where: { modeloId } });
    await guardarAjuste("sendero3d", "prueba", { modeloIds: [modeloId], canal: "web", tipo: "envio", valor: 50000, nota: "PRUEBA SDD 015" });
    const [conEnvio] = await preciosDeCombinaciones("sendero3d", { modeloIds: [modeloId] }, await cargarContextoDePrecios("sendero3d"));
    ok(conEnvio.precios!.web >= p0.web, "un envío propio caro no baja el precio de la web", { antes: p0.web, despues: conEnvio.precios!.web });
  } finally {
    await borrarAjuste("sendero3d", { modeloIds: [modeloId], canal: "web", tipo: "porcentaje" });
    await prisma.ajustePrecio.deleteMany({ where: { modeloId, nota: "PRUEBA SDD 015" } });
    ok((await prisma.ajustePrecio.count({ where: { modeloId } })) === 0, "la prueba se borró");
  }
}

contraLaBase()
  .catch((e) => {
    console.error(e);
    fallas++;
  })
  .finally(async () => {
    console.log(`\n${pruebas - fallas} de ${pruebas} bien`);
    await prisma.$disconnect();
    process.exit(fallas ? 1 : 0);
  });
