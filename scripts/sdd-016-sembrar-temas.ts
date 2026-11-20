/**
 * docs/sdd/016 — arma los temas a partir de la serie de los productos.
 *
 *   npx tsx --env-file=.env --env-file=.env.local --tsconfig tsconfig.json scripts/sdd-016-sembrar-temas.ts          (muestra)
 *   npx tsx --env-file=.env --env-file=.env.local --tsconfig tsconfig.json scripts/sdd-016-sembrar-temas.ts --guardar
 *
 * Un tema por serie normalizada, con las uniones que validó Agustín el 2026-11-20 (JOJO + Jojos,
 * K4os + Kpop K4os, Devil may cry ×2, One Piece ×2), un tipo y alias extra para que coincidan los
 * títulos de estrenos y las búsquedas de ML. No toca productos (RN-3). Se puede correr de nuevo:
 * suma alias, no duplica.
 */
import { prisma } from "@/lib/prisma";
import { normalizar, type TipoDeTema } from "@/lib/temas";

/** Series que van juntas, por nombre normalizado → el nombre del tema. */
const UNIONES: Record<string, string> = {
  jojo: "JOJO",
  jojos: "JOJO",
  k4os: "K4os",
  "kpop k4os": "K4os",
  "devil may cry": "Devil May Cry",
  "one piece": "One Piece",
  // A revisar con Agustín: no estaban en la validación.
  mundial: "Mundial FIFA 2026",
  "mundial fifa 2026": "Mundial FIFA 2026",
  "graviti falls": "Gravity Falls",
};

const TIPOS: Record<string, TipoDeTema> = {
  bleach: "anime", "demon slayer": "anime", jojo: "anime", "nanatsu no taizai": "anime", "one piece": "anime",
  "re zero": "anime", "solo leveling": "anime", pokemon: "anime",
  bts: "kpop", k4os: "kpop", kpop: "kpop", "kpop huntrix": "kpop",
  "ac dc": "musica", "baby metal": "musica", cantante: "musica",
  "devil may cry": "juego", "elden ring": "juego", "hollow knight": "juego", "league of legends": "juego",
  "mario bros": "juego", "mortal kombat": "juego", "resident evil": "juego", valorant: "juego",
  "world of warcraft": "juego", "accesorios dyd": "juego",
  "mundial fifa 2026": "deporte", "gravity falls": "serie",
  "deco hogar": "producto", exhibidor: "producto", herramientas: "producto", "juego de mesa": "producto",
  minimalista: "producto", "porta auricular": "producto", repuesto: "producto",
};

/** Alias extra: cómo aparece en TMDB, AniList o en las búsquedas. Normalizados. */
const EXTRA: Record<string, string[]> = {
  "demon slayer": ["kimetsu no yaiba", "tanjiro", "nezuko", "zenitsu", "inosuke", "rengoku", "shinobu", "tomioka", "giyu", "muzan", "hashira"],
  "one piece": ["luffy", "zoro", "sanji", "nami", "chopper", "shanks"],
  bleach: ["ichigo", "zangetsu", "kurosaki"],
  "nanatsu no taizai": ["seven deadly sins", "meliodas"],
  "solo leveling": ["sung jin woo", "jinwoo"],
  jojo: ["jojo s bizarre adventure"],
  "kpop huntrix": ["huntrix", "kpop demon hunters", "guerreras kpop", "kpop guerreras", "las guerreras kpop", "rumi", "zoey", "saja boys"],
  "ac dc": ["acdc"],
  "mundial fifa 2026": ["mundial 2026", "copa del mundo"],
  "gravity falls": ["gravity falls"],
  "porta auricular": ["porta auriculares", "soporte auriculares"],
  "mario bros": ["mario"],
  "league of legends": ["lol league of legends"],
  "re zero": ["re zero kara hajimeru isekai seikatsu"],
};

async function main() {
  const guardar = process.argv.includes("--guardar");
  const series = await prisma.modelo.groupBy({
    by: ["serie"],
    where: { tenantId: "sendero3d", esInsumo: false, serie: { not: null } },
    _count: true,
  });

  const temas = new Map<string, { nombre: string; alias: Set<string>; tipo: TipoDeTema; productos: number; series: string[] }>();
  for (const s of series) {
    const original = s.serie!.trim();
    if (!original) continue;
    const n = normalizar(original);
    const nombre = UNIONES[n] ?? original;
    const clave = normalizar(nombre);
    const t = temas.get(clave) ?? { nombre, alias: new Set<string>(), tipo: TIPOS[clave] ?? TIPOS[n] ?? "otro", productos: 0, series: [] };
    t.alias.add(n);
    t.alias.add(clave);
    for (const a of EXTRA[clave] ?? EXTRA[n] ?? []) t.alias.add(normalizar(a));
    t.productos += s._count;
    t.series.push(original);
    temas.set(clave, t);
  }

  const lista = [...temas.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  for (const t of lista) {
    console.log(`${t.nombre.padEnd(22)} ${t.tipo.padEnd(9)} ${String(t.productos).padStart(3)} productos · series: ${t.series.join(", ")} · alias: ${[...t.alias].join(", ")}`);
  }
  console.log(`\n${lista.length} temas de ${series.length} series`);
  if (!guardar) return console.log("(sin --guardar: no se escribió nada)");

  let creados = 0;
  let actualizados = 0;
  for (const t of lista) {
    const [actual] = await prisma.$queryRaw<Array<{ id: string; alias: string[] }>>`
      SELECT id, alias FROM public.temas WHERE tenant_id = 'sendero3d' AND lower(nombre) = lower(${t.nombre})`;
    if (actual) {
      const alias = [...new Set([...actual.alias, ...t.alias])];
      if (alias.length !== actual.alias.length) {
        await prisma.tema.update({ where: { id: actual.id }, data: { alias } });
        actualizados++;
      }
    } else {
      await prisma.tema.create({ data: { nombre: t.nombre, tipo: t.tipo, alias: [...t.alias] } });
      creados++;
    }
  }
  console.log(`creados ${creados} · con alias nuevos ${actualizados}`);
}

main().finally(() => prisma.$disconnect());
