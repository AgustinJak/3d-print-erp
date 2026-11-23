/**
 * docs/sdd/018 — la zona de direcciones conocidas, contra las zonas de la base y georef.
 *
 *   npx tsx --env-file=.env --env-file=.env.local --tsconfig tsconfig.json scripts/sdd-018-probar-zonas.ts
 *
 * Sólo localidades y códigos postales: ninguna dirección real. Guarda en localidades_reparto lo que
 * contesta georef (es el cache de producción, está bien que quede).
 */
import { prisma } from "@/lib/prisma";
import { cpNumero, zonaDe, zonasActivas } from "@/lib/zonas-reparto";

const casos: Array<[string, string, string, string]> = [
  // provincia, localidad, cp, zona esperada
  ["Capital Federal", "Villa Crespo", "1414", "CABA"],
  ["Buenos Aires", "Villa Crespo", "C1414ABC", "CABA"],
  ["Buenos Aires", "Florida Oeste", "1604", "Zona 1"],
  ["Buenos Aires", "Tres de febrero", "1702", "Zona 1"],
  ["Buenos Aires", "Ramos Mejía", "1704", "Zona 1"],
  ["Buenos Aires", "Lanús Oeste", "1824", "Zona 1"],
  ["Buenos Aires", "Ituzaingó", "1714", "Zona 1"],
  ["Buenos Aires", "González Catán", "1759", "Zona 2"],
  ["Buenos Aires", "Plátanos", "1861", "Zona 2"],
  ["Buenos Aires", "Benavidez", "1621", "Zona 2"],
  ["Buenos Aires", "Bernal", "1876", "Zona 2"],
  ["Buenos Aires", "Tristán Suárez", "1806", "Zona 3"],
  ["Buenos Aires", "Guernica", "1862", "Zona 3"],
  ["Buenos Aires", "La Plata", "1900", "Zona 3"],
];

async function main() {
  const zonas = await zonasActivas();
  let ok = 0;
  for (const [provincia, localidad, cp, esperada] of casos) {
    const z = await zonaDe({ provincia, localidad, cp }, zonas);
    const bien = z?.nombre === esperada;
    if (bien) ok++;
    console.log(`${bien ? "✓" : "✗"} ${localidad} (${cp}) → ${z?.nombre ?? "sin zona"}${bien ? "" : `, esperaba ${esperada}`}`);
  }
  const cpBien = cpNumero("C1414ABC") === 1414 && cpNumero("1861") === 1861 && cpNumero("") === null;
  console.log(`${cpBien ? "✓" : "✗"} cpNumero`);
  console.log(`\n${ok + (cpBien ? 1 : 0)} de ${casos.length + 1}`);
  process.exitCode = ok === casos.length && cpBien ? 0 : 1;
}
main().finally(() => prisma.$disconnect());
