/**
 * docs/sdd/012 — pruebas puras de las tareas del día.
 *
 *   npx tsx scripts/sdd-012-probar-tareas.ts
 */
import { diaDe, diaSiguiente, diasAbierta, extensionDe, inicioDelDia, ordenEntre, tamanoLegible, textoDeFrecuencia, tocaElDia, vaEnElTablero } from "@/lib/tareas-reglas";

let pruebas = 0;
let fallas = 0;
function ok(cond: boolean, que: string, detalle?: unknown) {
  pruebas++;
  if (!cond) fallas++;
  console.log(`${cond ? "✓" : "✗"} ${que}${cond || detalle === undefined ? "" : `\n    ${JSON.stringify(detalle)}`}`);
}

// El día es el de Argentina, no el de UTC.
ok(diaDe(new Date("2026-11-16T02:30:00Z")) === "2026-11-15", "las 23:30 del 15 en Argentina siguen siendo el 15", diaDe(new Date("2026-11-16T02:30:00Z")));
ok(diaDe(new Date("2026-11-16T03:00:00Z")) === "2026-11-16", "medianoche en Argentina ya es el 16");
ok(inicioDelDia("2026-11-16").toISOString() === "2026-11-16T03:00:00.000Z", "el día empieza a las 3 UTC");
ok(diaSiguiente("2026-11-30") === "2026-12-01", "el día siguiente cruza el mes");

// Terminadas se limpia sola: sólo las de hoy.
ok(vaEnElTablero({ estado: "terminada", terminadaEn: "2026-11-16T15:00:00Z" }, "2026-11-16"), "una terminada hoy se ve");
ok(!vaEnElTablero({ estado: "terminada", terminadaEn: "2026-11-15T15:00:00Z" }, "2026-11-16"), "una terminada ayer ya no");
ok(!vaEnElTablero({ estado: "terminada", terminadaEn: "2026-11-16T02:00:00Z" }, "2026-11-16"), "terminada a las 23 del 15 (hora argentina) es de ayer");
ok(vaEnElTablero({ estado: "trabada", terminadaEn: null }, "2026-11-16"), "lo que no está terminado sigue");

// Las que se repiten. El 16/11/2026 es lunes.
ok(tocaElDia({ frecuencia: "diaria", dias: [] }, "2026-11-16"), "diaria: todos los días");
ok(tocaElDia({ frecuencia: "semanal", dias: [1, 4] }, "2026-11-16") && !tocaElDia({ frecuencia: "semanal", dias: [1, 4] }, "2026-11-17"), "semanal: lunes sí, martes no");
ok(tocaElDia({ frecuencia: "mensual", dias: [8] }, "2026-12-08") && !tocaElDia({ frecuencia: "mensual", dias: [8] }, "2026-12-09"), "mensual: el 8");
ok(tocaElDia({ frecuencia: "mensual", dias: [31] }, "2026-11-30"), "el 31 en un mes de 30 cae el 30");
ok(tocaElDia({ frecuencia: "mensual", dias: [30] }, "2027-02-28"), "el 30 en febrero cae el 28");

ok(ordenEntre(null, null) === 1000 && ordenEntre(1000, 2000) === 1500 && ordenEntre(null, 1000) === 0 && ordenEntre(1000, null) === 2000, "el orden entre dos tarjetas");
ok(diasAbierta("2026-11-13T15:00:00Z", "2026-11-16") === 3, "abierta desde hace 3 días");
ok(textoDeFrecuencia({ frecuencia: "semanal", dias: [4, 1] }) === "Los lunes y jueves", "texto semanal", textoDeFrecuencia({ frecuencia: "semanal", dias: [4, 1] }));
ok(textoDeFrecuencia({ frecuencia: "mensual", dias: [8] }) === "El 8 de cada mes", "texto mensual");
ok(tamanoLegible(13_000_000) === "12 MB" && tamanoLegible(2_500_000) === "2,4 MB", "tamaños", [tamanoLegible(13_000_000), tamanoLegible(2_500_000)]);
ok(extensionDe("Katana Tanjiro v2.STL") === "stl" && extensionDe("sin") === "", "la extensión");

console.log(`\n${fallas ? `✗ ${fallas} de ${pruebas} fallaron` : `✓ ${pruebas} de ${pruebas}`}`);
process.exitCode = fallas ? 1 : 0;
