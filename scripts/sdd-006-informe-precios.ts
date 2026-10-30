/**
 * docs/sdd/006 — informe de la mudanza de precios, en modo de prueba (TASK-009).
 *
 *   npx tsx --env-file=.env scripts/sdd-006-informe-precios.ts
 *   WEB_ENVIO_GRATIS_DESDE=0 WEB_ENVIO_RESERVA=0 npx tsx ...   (otro umbral y otra reserva; umbral 0 = siempre gratis)
 *
 * No escribe nada: lee las combinaciones, sus publicaciones de ML (con la última lectura) y las
 * tarifas, y calcula para cada producto el precio de la web con sus descuentos por cantidad, y la
 * opción 1 y la opción 2 de ML con lo que ML cobra de verdad. Con las decisiones de Agustín del
 * 2026-10-30: margen 35 % sobre el precio en los dos canales, promo de ML 10 % salvo que publique
 * arriba de $30.000, y tramos de la web que dejen 30 / 25 / 20 %. Deja el informe en
 * `docs/sdd/006-precios-en-el-erp/informe-<fecha>.md`.
 */
import { writeFileSync } from "fs";
import { prisma } from "@/lib/prisma";
import { cargarContextoDePrecios, preciosDeCombinaciones } from "@/lib/precios-combinacion";
import {
  margenesDeTramos,
  TRAMOS_WEB,
  precioWeb,
  type GastosVenta,
} from "@/lib/precios-formula";
import type { LecturaMl } from "@/lib/precios-ml";
import {
  costosDeLectura,
  costosDeOpcionDos,
  costosDeOpcionUno,
  opcionDe,
  opcionUnoConMargen,
  opcionUnoFija,
  precioParaGanancia,
} from "@/lib/precios-ml-publicacion";
import { tarifasGuardadas } from "@/lib/tarifas-ml";
import { pctMasAlto } from "@/lib/tarifas-ml-reglas";

const T = "sendero3d";
const MARGEN = 35;
const PROMO_GENERAL = 10;
const UMBRAL = 30000;
// La web con envío gratis desde $40.000, también en los pedidos por cantidad, y una reserva en % de
// cada precio que paga esos envíos (spec 009, decisión de Agustín del 2026-10-30). Con los pedidos de abril a
// octubre, ese umbral se habría llevado el 1,6 % de lo vendido; se reserva 3 % porque el umbral
// empuja carritos más grandes y los pedidos por cantidad lo cruzan siempre.
const WEB_ENVIO_GRATIS_DESDE = Number(process.env.WEB_ENVIO_GRATIS_DESDE ?? 40000);
const WEB_ENVIO_RESERVA = Number(process.env.WEB_ENVIO_RESERVA ?? 3);

const $ = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;
const pct = (a: number, b: number) => (b > 0 ? `${a >= b ? "+" : "−"}${Math.abs(Math.round(((a - b) / b) * 100))} %` : "");
const mediana = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};

async function main() {
  const cx = await cargarContextoDePrecios(T);
  const tarifas = await tarifasGuardadas(T);
  const combinaciones = (await preciosDeCombinaciones(T, {}, cx)).filter((p) => p.costo);
  const claves = await prisma.mapeoCanal.findMany({
    where: { tenantId: T, canal: "mercadolibre", ignorar: false, combinacionId: { not: null } },
    select: { clave: true, combinacionId: true, unidades: true, precioPublicado: true, precioLectura: true },
  });
  const fijos = new Map((await prisma.modelo.findMany({ where: { tenantId: T, precioMlFijo: { not: null } }, select: { id: true, precioMlFijo: true } })).map((m) => [m.id, m.precioMlFijo!]));
  const porComb = new Map<string, typeof claves>();
  for (const k of claves) porComb.set(k.combinacionId!, [...(porComb.get(k.combinacionId!) ?? []), k]);

  const filas: string[] = [];
  const umbral: string[] = [];
  const sinPromo: string[] = [];
  const avisosPromo: string[] = [];
  const caras: string[] = [];
  const sinPublicar: string[] = [];
  const margenPropio = new Set<string>();
  const margenes = new Map<number, Array<{ nombre: string; m: number }>>(TRAMOS_WEB.map((t) => [t.desde, []]));
  let suben = 0, bajan = 0, iguales = 0;

  for (const p of combinaciones.sort((a, b) => a.modelo.localeCompare(b.modelo, "es") || a.nombre.localeCompare(b.nombre, "es"))) {
    const fab = p.costo!.fabricacion;
    const ins = p.costo!.insumos;
    const propia = cx.piezas.get(p.costo!.pieza.bodegaModelId)?.politica;
    if (propia?.margen != null) margenPropio.add(p.modelo);
    const g: GastosVenta = {
      ...cx.general.gastos,
      mlPromoPct: propia?.promo ?? PROMO_GENERAL,
      // Los márgenes propios de Bodega eran sobre otra cuenta: el informe pone 35 % a todos.
      margenMinorista: MARGEN,
      webEnvioGratisDesde: WEB_ENVIO_GRATIS_DESDE,
      webEnvioReservaPct: WEB_ENVIO_RESERVA,
    };
    const redondeo = p.politica.redondeo;
    const fijo = fijos.get(p.modeloId);
    const nombre = `${p.nombre}${fijo ? " 📌" : ""}`;

    // La web: 35 % sobre el precio con la reserva para el envío, y lo que deja cada tramo.
    const web = precioWeb(g, fab, ins, redondeo);
    const tramos = margenesDeTramos(g, web, fab, ins);
    for (const t of tramos) margenes.get(t.desde)!.push({ nombre: p.nombre, m: t.margen });
    const textoTramos = tramos.map((t) => `${Math.round(t.margen)} %${t.envioPorUnidad ? "🚚" : ""}${t.llega ? "" : " ⚠️"}`).join(" / ");

    // ML.
    const suyas = (porComb.get(p.combinacionId) ?? []).filter((k) => k.unidades <= 1);
    const lect = suyas.map((k) => ({ k, l: k.precioLectura as LecturaMl | null })).filter((x) => x.l?.tipo);
    const cat = lect.find((x) => x.l!.categoria)?.l!.categoria ?? null;
    const pctCat = (cat ? tarifas?.categorias[cat] : undefined) ?? pctMasAlto(tarifas) ?? g.mlComisionPct;
    const estimada = !cat || tarifas?.categorias[cat] == null;
    const envio = Math.max(0, ...lect.map((x) => x.l!.costoEnvio ?? 0)) || null;

    const op1 = fijo
      ? opcionUnoFija(g, fab, ins, fijo, costosDeOpcionUno(g, pctCat), tarifas)
      : opcionUnoConMargen(g, fab, ins, redondeo, costosDeOpcionUno(g, pctCat), tarifas);
    const margen1 = op1.final > 0 ? Math.round((op1.ganancia / op1.final) * 100) : 0;
    const op2 = precioParaGanancia(g, fab, ins, redondeo, op1.ganancia, costosDeOpcionDos(tarifas, g, pctCat, envio), tarifas);

    if (op1.final >= UMBRAL) umbral.push(`| ${nombre} | ${$(op1.publicado)} (cliente ${$(op1.final)}) | ${margen1} % |`);
    if (!fijo && g.mlPromoPct > 0 && op1.publicado === op1.final) sinPromo.push(`| ${nombre} | ${$(op1.final)} | ${$(Math.ceil(op1.final / (1 - g.mlPromoPct / 100)))} |`);
    if (op2.final > op1.final * 2) caras.push(`| ${nombre} | ${$(op1.publicado)} | ${$(op2.publicado)} | ${$(op2.costos.costoEnvio)}${envio ? "" : " (estimado)"} |`);

    const columnas = `${$(fab + ins)} | ${$(web)} | ${textoTramos} | ${$(op1.publicado)}${op1.publicado === op1.final ? "" : ` (cliente ${$(op1.final)})`}<br>deja ${$(op1.ganancia)} (${margen1} %) | ${$(op2.publicado)}`;
    if (!lect.length) {
      sinPublicar.push(`| ${nombre} | ${columnas} | ${estimada ? "estimada" : `${pctCat} %`} |`);
      continue;
    }

    const pubs = lect
      .map(({ k, l }) => {
        const mla = k.clave.split("|")[0];
        const pr = precioParaGanancia(g, fab, ins, redondeo, op1.ganancia, costosDeLectura(l!, mla, tarifas, g, pctCat), tarifas);
        const hoy = k.precioPublicado ?? 0;
        if (pr.publicado > hoy + 1) suben++;
        else if (pr.publicado < hoy - 1) bajan++;
        else iguales++;
        const que = `${l!.tipo === "gold_pro" ? "Premium" : "Clásica"}${l!.campaniaCuotas ? " 3 cuotas" : ""}${l!.envioGratis ? " envío gratis" : ""}`;
        // Spec 010: la promo que tiene hoy contra la que supone el precio propuesto.
        const activa = l!.paga && hoy > 0 ? Math.max(0, (1 - l!.paga / hoy) * 100) : 0;
        const esperada = pr.publicado > pr.final ? g.mlPromoPct : 0;
        if (Math.abs(activa - esperada) > 0.5) {
          const tipo = activa < 0.5 ? "**Sin promo**" : esperada === 0 ? "Promo de más" : "Promo distinta";
          const cual = l!.promo ? `${l!.promo.tipo ?? "promo"}${l!.promo.fin ? `, hasta el ${l!.promo.fin.slice(0, 10)}` : ""}` : "—";
          avisosPromo.push(`| ${nombre} | ${mla} | ${tipo} | ${Math.round(activa * 10) / 10} % (${cual}) | ${esperada} % |`);
        }
        return `${mla} (opción ${opcionDe(l!)}, ${que}): ${$(hoy)} → **${$(pr.publicado)}** ${pct(pr.publicado, hoy)}`;
      })
      .join("<br>");
    const tiene = new Set(lect.map(({ l }) => opcionDe(l!)));
    const falta = [1, 2].filter((o) => !tiene.has(o as 1 | 2)).map((o) => `falta la opción ${o}`).join(", ");
    filas.push(`| ${nombre} | ${columnas} | ${pctCat} %${estimada ? " (estimada)" : ""} | ${pubs}${falta ? `<br>_${falta}_` : ""} |`);
  }

  const gWeb = cx.general.gastos;
  const pctWeb = gWeb.webCobroPct + gWeb.webPublicidadPct + gWeb.iibbPct;
  const filasTramos = TRAMOS_WEB.map((t) => {
    const ms = margenes.get(t.desde)!;
    const xs = ms.map((x) => x.m);
    const peor = ms.reduce((a, b) => (b.m < a.m ? b : a));
    const debajo = ms.filter((x) => x.m < t.piso - 0.5).length;
    return `| ${t.desde} u | **${t.descuento} %** | ${t.piso} % | ${Math.round(peor.m)} % (${peor.nombre}) | ${Math.round(mediana(xs))} % | ${debajo ? `**${debajo}**` : "ninguno"} |`;
  }).join("\n");

  const hoy = new Date().toISOString().slice(0, 10);
  const md = `---
feature: 006-precios-en-el-erp
generado: ${new Date().toISOString()}
---

# Informe de la mudanza de precios · ${hoy}

En modo de prueba: **no se cambió nada**. Lo generó \`scripts/sdd-006-informe-precios.ts\` con la
última lectura de ML y las tarifas leídas de ML (${tarifas?.leidoEn ?? "sin leer"}).

Cómo se calcula (decisiones de Agustín del 2026-10-30):

- **Margen ${MARGEN} % sobre el precio de venta, en la web y en ML**: precio = costo / (1 − gastos del
  canal − ${MARGEN} %). Arriba de $30.000 el envío se suma sin pedirle margen, así que esos quedan
  cerca de 25 %. Los márgenes propios que tenían las piezas en Bodega eran sobre otra cuenta y acá
  no se usan (${margenPropio.size} modelos los tenían: ${[...margenPropio].join(", ") || "ninguno"}).
- **Web**: gastos ${pctWeb} % (cobro ${gWeb.webCobroPct} %, publicidad ${gWeb.webPublicidadPct} %, IIBB ${gWeb.iibbPct} %) más
  **${WEB_ENVIO_RESERVA} % de reserva para el envío gratis**, que es desde ${WEB_ENVIO_GRATIS_DESDE ? $(WEB_ENVIO_GRATIS_DESDE) : "$0 (siempre)"}. Debajo, el
  envío lo paga el cliente. Un producto que solo ya pasa el umbral lleva su envío (${$(gWeb.webEnvioCosto)}) adentro, sin
  margen y sin reserva.
- **Tramos de la web**: ${TRAMOS_WEB.map((t) => `${t.desde} u ${t.descuento} %`).join(", ")}, uno para todos los productos, con
  envío gratis si el pedido pasa el umbral. Se mide el pedido mínimo del tramo (el peor caso): su envío
  se reparte en sus unidades. 🚚 = ese pedido tiene envío gratis; ⚠️ = perfora el piso del tramo.
- **Opción 1 de ML**: Clásica, sin cuotas; envío a cargo del comprador debajo de $30.000. Comisión
  de la categoría y cargo fijo del tramo (${tarifas?.fijos.map((f) => `desde ${$(f.desde)}: ${$(f.monto)}`).join(", ") ?? "sin tramos"}).
- **Opción 2 de ML**: 3 cuotas sin interés (${tarifas?.recargoCuotas.general ?? 8.5} % de recargo, medido en
  ${tarifas?.recargoCuotas.ventas ?? 0} ventas) y envío gratis, subida hasta dejar lo mismo que la opción 1.
- **Promo de ML ${PROMO_GENERAL} %**: el publicado se infla para que el cliente pague el precio calculado,
  **salvo que el inflado lo publique arriba de $30.000**: ahí se publica sin promo.
- 📌 = precio de ML fijado a mano (los porta auriculares en $29.434).

## Resumen

- Publicaciones de ML: **${suben} suben**, ${bajan} bajan, ${iguales} quedan igual.
- ${umbral.length} productos quedan arriba de $30.000 en ML.
- **${sinPromo.length} productos se publican sin promo** porque con ella pasarían los $30.000.
- ${caras.length} productos tienen una opción 2 de más del doble que la opción 1.
- ${sinPublicar.length} combinaciones no tienen publicación en ML.

## Descuentos por cantidad de la web

El Shop tiene **un solo juego de tramos para toda la web**: hoy 5:10, 10:20, 20:30, a cambiar por
${TRAMOS_WEB.map((t) => `${t.desde}:${t.descuento}`).join(", ")}. El pedido por cantidad tiene envío gratis cuando pasa el umbral: ese
envío se descuenta de verdad, repartido en sus unidades. El piso es lo que deja el peor producto.

| Tramo | Descuento | Piso | Peor producto | Mediana | Debajo del piso |
|---|---|---|---|---|---|
${filasTramos}

## Arriba de $30.000 en ML

| Producto | Opción 1 | Margen |
|---|---|---|
${umbral.join("\n") || "| — | | |"}

## Sin promo por el umbral

Con la promo se publicarían arriba de $30.000; se publican a lo que paga el cliente.

| Producto | Se publica | Con promo sería |
|---|---|---|
${sinPromo.join("\n") || "| — | | |"}

## Avisos de promo (spec 010, prueba)

La promo que tiene cada publicación hoy (1 − lo que paga el cliente / el precio publicado) contra la
que supone el precio propuesto. Con los precios nuevos aplicados, estas son las publicaciones donde
hay que prender, cambiar o sacar la promo en ML. ${avisosPromo.length} publicaciones.

| Producto | Publicación | Aviso | Tiene hoy | Supone el precio nuevo |
|---|---|---|---|---|
${avisosPromo.join("\n") || "| — | | | | |"}

## Opción 2 más del doble que la opción 1

| Producto | Opción 1 | Opción 2 | Envío gratis |
|---|---|---|---|
${caras.join("\n") || "| — | | | |"}

## Producto por producto (con publicaciones en ML)

| Combinación | Costo | Web | Margen en 5 / 10 / 20 u | ML opción 1 | ML opción 2 | Comisión | Publicaciones: hoy → propuesto |
|---|---|---|---|---|---|---|---|
${filas.join("\n")}

## Sin publicación en ML

| Combinación | Costo | Web | Margen en 5 / 10 / 20 u | ML opción 1 | ML opción 2 | Comisión |
|---|---|---|---|---|---|---|
${sinPublicar.join("\n") || "| — | | | | | | |"}
`;
  const ruta = `docs/sdd/006-precios-en-el-erp/informe-${hoy}.md`;
  writeFileSync(ruta, md);
  console.log(`${ruta}: ${filas.length} con publicaciones, ${sinPublicar.length} sin; suben ${suben}, bajan ${bajan}, iguales ${iguales}; arriba de 30k ${umbral.length}; sin promo ${sinPromo.length}`);
  console.log(filasTramos);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
