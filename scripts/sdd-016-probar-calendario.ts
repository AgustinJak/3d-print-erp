/**
 * docs/sdd/016 — fechas comerciales (puro) y el estreno en Argentina de TMDB (lee, no guarda).
 *
 *   npx tsx --env-file=.env --env-file=.env.local --tsconfig tsconfig.json scripts/sdd-016-probar-calendario.ts
 */
import { FECHAS_COMERCIALES, proximasFechasComerciales } from "@/lib/fechas-comerciales";
import { fechaDeEstrenoAr } from "@/lib/tmdb";

let ok = 0;
let mal = 0;
function ver(nombre: string, cond: boolean, detalle = "") {
  if (cond) ok++;
  else mal++;
  console.log(`${cond ? "✓" : "✗"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}
const iso = (d: Date) => d.toISOString().slice(0, 10);
const de = (clave: string, anio: number) => iso(FECHAS_COMERCIALES.find((f) => f.clave === clave)!.fecha(anio));

// Contra el calendario real.
ver("Día del Padre 2026: 21/6", de("dia-del-padre", 2026) === "2026-06-21");
ver("Día del Niño 2026: 16/8", de("dia-del-nino", 2026) === "2026-08-16");
ver("Día de la Madre 2026: 18/10", de("dia-de-la-madre", 2026) === "2026-10-18");
ver("Día del Padre 2027: 20/6", de("dia-del-padre", 2027) === "2027-06-20", de("dia-del-padre", 2027));
ver("Día de la Madre 2027: 17/10", de("dia-de-la-madre", 2027) === "2027-10-17", de("dia-de-la-madre", 2027));
ver("Pascuas 2027: 28/3", de("pascuas", 2027) === "2027-03-28", de("pascuas", 2027));
ver("Black Friday 2026: 27/11", de("black-friday", 2026) === "2026-11-27", de("black-friday", 2026));

const proximas = proximasFechasComerciales(new Date("2026-11-20T12:00:00Z"));
ver("desde el 20/11/2026 la primera es Black Friday", proximas[0]?.clave === "black-friday", proximas.slice(0, 3).map((p) => `${p.titulo} ${iso(p.fecha)}`).join(" · "));
ver("Navidad que viene es la de 2026", iso(proximas.find((p) => p.clave === "navidad")!.fecha) === "2026-12-25");
ver("San Valentín que viene es el de 2027", iso(proximas.find((p) => p.clave === "san-valentin")!.fecha) === "2027-02-14");
ver("el mismo día cuenta", proximasFechasComerciales(new Date("2026-12-25T12:00:00Z"))[0]?.clave === "navidad");

async function main() {
  // Películas con estreno conocido en Argentina (ids de TMDB).
  for (const [id, nombre] of [[872585, "Oppenheimer"], [346698, "Barbie"], [502356, "Super Mario Bros. La película"]] as const) {
    try {
      const f = await fechaDeEstrenoAr(id);
      ver(`${nombre}: tiene estreno en Argentina`, !!f, f ? iso(f) : "sin fecha");
    } catch (e) {
      ver(`${nombre}: TMDB contestó`, false, e instanceof Error ? e.message : String(e));
    }
  }
  console.log(`\n${ok} de ${ok + mal}`);
  process.exitCode = mal ? 1 : 0;
}
main();
