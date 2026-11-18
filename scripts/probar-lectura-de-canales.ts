/**
 * El turno de lectura de canales (2026-11-18), contra la base, con un negocio de prueba que se borra.
 *
 *   npx tsx --env-file=.env --env-file=.env.local --tsconfig tsconfig.json scripts/probar-lectura-de-canales.ts
 */
import { prisma } from "@/lib/prisma";
import { estaVieja, soltarTurno, tomarTurno, ultimaLectura } from "@/lib/lectura-de-canales";

const T = "prueba-lectura-canales";
let ok = 0;
let mal = 0;
const ver = (n: string, c: boolean) => (c ? ok++ : mal++, console.log(`${c ? "✓" : "✗"} ${n}`));

async function main() {
  try {
    ver("sin lecturas, está vieja", estaVieja((await ultimaLectura(T, "mercadolibre")).hecha));
    ver("toma el turno", await tomarTurno(T, "mercadolibre"));
    ver("un segundo no puede", !(await tomarTurno(T, "mercadolibre")));
    ver("se ve en curso", (await ultimaLectura(T, "mercadolibre")).enCurso);
    ver("la web es otro turno", await tomarTurno(T, "shop"));
    await soltarTurno(T, "mercadolibre", false);
    const tras = await ultimaLectura(T, "mercadolibre");
    ver("si falla, suelta sin anotar la hora", !tras.enCurso && tras.hecha === null);
    ver("se puede volver a tomar", await tomarTurno(T, "mercadolibre"));
    await soltarTurno(T, "mercadolibre", true);
    const fin = await ultimaLectura(T, "mercadolibre");
    ver("si termina, anota la hora y queda al día", !fin.enCurso && !!fin.hecha && !estaVieja(fin.hecha));
    ver("hace 61 minutos ya está vieja", estaVieja(new Date(Date.now() - 61 * 60 * 1000)));
    await prisma.$executeRaw`UPDATE public.config_tenant SET data = data || jsonb_build_object('lectura_shop_en_curso', (now() - interval '7 minutes')::text) WHERE tenant_id = ${T}`;
    ver("un turno colgado de 7 minutos se puede tomar", await tomarTurno(T, "shop"));
  } finally {
    await prisma.$executeRaw`DELETE FROM public.config_tenant WHERE tenant_id = ${T}`;
  }
  console.log(`\n${ok} de ${ok + mal}`);
  process.exitCode = mal ? 1 : 0;
}
main().finally(() => prisma.$disconnect());
