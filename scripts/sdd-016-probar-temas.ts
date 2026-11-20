/**
 * docs/sdd/016 — la lógica pura de los temas, con palabras reales de ML y las series de hoy.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/sdd-016-probar-temas.ts
 */
import { coincide, esGenerica, leerTema, normalizar, temaDeTexto } from "@/lib/temas";

let ok = 0;
let mal = 0;
function ver(nombre: string, cond: boolean, detalle = "") {
  if (cond) ok++;
  else mal++;
  console.log(`${cond ? "✓" : "✗"} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}

// normalizar
ver("tildes y mayúsculas", normalizar("Pokémon ÑANDÚ") === "pokemon nandu");
ver("k-pop pega el guion", normalizar("K-Pop Demon Hunters") === "kpop demon hunters");
ver("signos fuera", normalizar("Re:Zero") === "re zero" && normalizar("AC/DC") === "ac dc");
ver("JOJO y Jojos distintos (los une el alias)", normalizar("JOJO") === "jojo" && normalizar("Jojos") === "jojos");

// coincide
ver("labubu en «muneco mini labubu the»", coincide(normalizar("muneco mini labubu the"), "labubu"));
ver("bts no coincide dentro de «botas»", !coincide(normalizar("botas de lluvia"), "bts"));
ver("palabras seguidas: «demon slayer»", coincide(normalizar("katana demon slayer tanjiro"), "demon slayer"));
ver("alias de 2 letras no cuenta", !coincide("lol league of legends", "lo"));

// temaDeTexto
const temas = [
  { id: "jojo", alias: ["jojo", "jojos"] },
  { id: "kpop", alias: ["kpop"] },
  { id: "huntrix", alias: ["huntrix", "kpop demon hunters"] },
  { id: "ds", alias: ["demon slayer", "kimetsu no yaiba"] },
];
ver("«KPop Demon Hunters» va a Huntrix, no a Kpop (alias más largo)", temaDeTexto("KPop Demon Hunters 2", temas)?.id === "huntrix");
ver("«kpop» suelto va a Kpop", temaDeTexto("kpop", temas)?.id === "kpop");
ver("título de AniList «Kimetsu no Yaiba: Hashira Geiko-hen»", temaDeTexto("Kimetsu no Yaiba: Hashira Geiko-hen", temas)?.id === "ds");
ver("«slime» no es de ningún tema", temaDeTexto("slime", temas) === null);

// genéricas
ver("«ofertas» es genérica", esGenerica("ofertas"));
ver("«labubu» no", !esGenerica("labubu"));
ver("«bts» suelta es corta: genérica para Búsquedas nuevas", esGenerica("bts"));

ver("«100214466» (sólo números) es genérica", esGenerica("100214466"));
ver("«dune» no es genérica", !esGenerica("dune"));

// leerTema
const hoy = new Date("2026-11-20T15:00:00-03:00");
const base = { busquedas: [], eventos: [], ventas: { ultimos30: 0, anteriores30: 0 }, productos: 1 };
const conMl = leerTema({ ...base, busquedas: [{ palabra: "labubu", categoriaId: "MLA1132", categoria: "Juguetes", posicion: 8, nueva: true }] }, hoy);
ver("top 10 en Juguetes + nueva = 4", conMl.puntaje === 4, conMl.senales.map((s) => s.texto).join(" · "));
const sitio = leerTema({ ...base, busquedas: [{ palabra: "labubu", categoriaId: "MLA", categoria: null, posicion: 8, nueva: false }] }, hoy);
ver("el sitio entero pesa la mitad", sitio.puntaje === 1.5);
const evento = leerTema({ ...base, eventos: [{ titulo: "X", tipo: "pelicula", fecha: "2026-12-02T00:00:00Z", enArgentina: true }] }, hoy);
ver("estreno en Argentina en 12 días = 3", evento.puntaje === 3 && evento.senales[0].texto === "estreno en 12 días", evento.senales[0]?.texto);
const noche = leerTema({ ...base, eventos: [{ titulo: "X", tipo: "pelicula", fecha: "2026-12-02T00:00:00Z", enArgentina: true }] }, new Date("2026-11-20T23:30:00-03:00"));
ver("a las 23:30 de Argentina (ya 21 en UTC) siguen siendo 12 días", noche.senales[0]?.texto === "estreno en 12 días", noche.senales[0]?.texto);
const mundial = leerTema({ ...base, eventos: [{ titulo: "X", tipo: "anime", fecha: "2027-01-20T00:00:00Z", enArgentina: false }] }, hoy);
ver("a 61 días, fecha mundial = 1", mundial.puntaje === 1 && mundial.senales[0].texto.includes("(fecha mundial)"), mundial.senales[0]?.texto);
const pasado = leerTema({ ...base, eventos: [{ titulo: "X", tipo: "pelicula", fecha: "2026-11-01T00:00:00Z", enArgentina: true }] }, hoy);
ver("un evento pasado no suma", pasado.puntaje === 0);
const sube = leerTema({ ...base, ventas: { ultimos30: 18, anteriores30: 5 } }, hoy);
ver("Demon Slayer: 18 contra 5 = sube (2)", sube.puntaje === 2 && sube.senales[0].texto === "vendiste 18, antes 5");
const jojo = leerTema({ ...base, ventas: { ultimos30: 113, anteriores30: 137 } }, hoy);
ver("JOJO: 113 contra 137 = vende (1), no baja", jojo.puntaje === 1 && !jojo.senales.some((s) => s.clave === "baja"));
const baja = leerTema({ ...base, ventas: { ultimos30: 5, anteriores30: 20 } }, hoy);
ver("5 contra 20 = aviso de baja, sin peso", baja.puntaje === 0 && baja.senales.some((s) => s.clave === "baja"));
const oportunidad = leerTema({ ...base, productos: 0, busquedas: [{ palabra: "labubu", categoriaId: "MLA1132", categoria: "Juguetes", posicion: 8, nueva: false }] }, hoy);
ver("con señal de ML y sin productos = oportunidad", oportunidad.oportunidad && oportunidad.senales.some((s) => s.clave === "sin-producto"));
const soloVentas = leerTema({ ...base, productos: 0, ventas: { ultimos30: 12, anteriores30: 0 } }, hoy);
ver("sólo ventas no es oportunidad", !soloVentas.oportunidad);

console.log(`\n${ok} de ${ok + mal}`);
process.exitCode = mal ? 1 : 0;
