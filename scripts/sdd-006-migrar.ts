/**
 * docs/sdd/006 — la configuración de precios pasa al ERP (TASK-009, spec 001).
 *
 *   npx tsx --env-file=.env scripts/sdd-006-migrar.ts            (modo de prueba: no escribe)
 *   npx tsx --env-file=.env scripts/sdd-006-migrar.ts --aplicar
 *
 * Arma `config_precios` con los gastos que hoy tiene Bodega y las decisiones de Agustín del
 * 2026-10-28 y 2026-10-30: margen 35 % sobre el precio, promo de ML 10 %, envío gratis de la web
 * desde $40.000 con reserva de 3 %. Con esa fila, el ERP calcula con su motor (precios-combinacion,
 * `origen: "erp"`). En modo de prueba compara lo que propone Precios hoy contra lo que propondría.
 *
 * Las políticas de las piezas de Bodega no se copian: el margen era sobre otra cuenta (35 % para
 * todos) y el redondeo y la promo de la pieza se siguen leyendo de Bodega mientras el producto del
 * ERP no tenga los suyos.
 */
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { cargarContextoDePrecios, cargarDelErp, precioDeClave, preciosDeCombinaciones, type ContextoDePrecios } from "@/lib/precios-combinacion";
import type { LecturaMl } from "@/lib/precios-ml";

const T = "sendero3d";
const DECISIONES = {
  margenMinorista: 35,
  mlPromoPct: 10,
  webEnvioGratisDesde: 40000,
  webEnvioReservaPct: 3,
};

const $ = (n: number | null) => (n == null ? "—" : `$${Math.round(n).toLocaleString("es-AR")}`);

async function main() {
  const aplicar = process.argv.includes("--aplicar");
  const ya = await prisma.configPrecios.findUnique({ where: { tenantId: T } });
  if (ya) {
    console.log("El ERP ya tiene su configuración de precios:", JSON.stringify(ya.gastos));
    return;
  }

  const hoy = await cargarContextoDePrecios(T);
  if (hoy.general.origen === "erp") throw new Error("inesperado: el contexto ya es del ERP");
  const gastos = { ...hoy.general.gastos, ...DECISIONES, redondeo: hoy.general.redondeo };
  console.log("Configuración nueva:", JSON.stringify(gastos));

  // Lo que propondría Precios con esa configuración, sin escribirla.
  const nuevo: ContextoDePrecios = {
    ...hoy,
    general: { gastos, redondeo: hoy.general.redondeo, deBodega: false, origen: "erp" },
    erp: await cargarDelErp(T),
  };
  const [antes, despues, mapeos] = await Promise.all([
    preciosDeCombinaciones(T, {}, hoy),
    preciosDeCombinaciones(T, {}, nuevo),
    prisma.mapeoCanal.findMany({
      where: { tenantId: T, ignorar: false, combinacionId: { not: null }, canal: { in: ["mercadolibre", "shop"] } },
      select: { canal: true, clave: true, unidades: true, combinacionId: true, precioPublicado: true, precioLectura: true, combinacion: { select: { nombre: true } } },
    }),
  ]);
  const a = new Map(antes.map((p) => [p.combinacionId, p]));
  const d = new Map(despues.map((p) => [p.combinacionId, p]));

  for (const canal of ["mercadolibre", "shop"] as const) {
    let suben = 0, bajan = 0, iguales = 0, sin = 0;
    const ejemplos: string[] = [];
    for (const m of mapeos.filter((x) => x.canal === canal)) {
      const pa = a.get(m.combinacionId!);
      const pd = d.get(m.combinacionId!);
      const mla = canal === "mercadolibre" ? m.clave.split("|")[0] : null;
      const lectura = canal === "mercadolibre" ? (m.precioLectura as unknown as LecturaMl | null) : null;
      const vAntes = pa ? precioDeClave(pa, canal, m.unidades, hoy.general.gastos) : null;
      const vDespues = pd ? precioDeClave(pd, canal, m.unidades, gastos, { cx: nuevo, mla, lectura }) : null;
      if (vAntes == null || vDespues == null) {
        sin++;
        continue;
      }
      if (vDespues > vAntes + 1) suben++;
      else if (vDespues < vAntes - 1) bajan++;
      else iguales++;
      if (ejemplos.length < 12) ejemplos.push(`  ${m.combinacion?.nombre}${m.unidades > 1 ? ` ×${m.unidades}` : ""} ${mla ?? ""}: publicado ${$(m.precioPublicado)} · hoy propone ${$(vAntes)} → ${$(vDespues)}`);
    }
    console.log(`\n${canal}: ${suben} suben, ${bajan} bajan, ${iguales} igual, ${sin} sin precio (respecto de lo que propone Precios hoy)`);
    console.log(ejemplos.join("\n"));
  }

  if (!aplicar) {
    console.log("\nModo de prueba: no se escribió nada. Con --aplicar se crea config_precios.");
    return;
  }
  const despuesJson = gastos as unknown as Prisma.InputJsonValue;
  await prisma.$transaction([
    prisma.configPrecios.create({ data: { tenantId: T, gastos: despuesJson, usuario: "migración SDD 006 (Claude, a pedido de Agustín)" } }),
    prisma.cambioConfigPrecios.create({ data: { tenantId: T, antes: Prisma.JsonNull, despues: despuesJson, usuario: "migración SDD 006 (Claude, a pedido de Agustín)" } }),
  ]);
  console.log("\nconfig_precios creada: el ERP calcula con su configuración.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
