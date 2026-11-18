import { prisma } from "@/lib/prisma";
import { LECTURA_VIGENTE_MS } from "@/lib/precios-ml";

/**
 * Quién lee los precios de un canal y cuándo (2026-11-18).
 *
 * Precios y Productos piden una lectura "automática" al entrar: se hace sólo si la última lectura
 * terminada tiene más de una hora (la misma vigencia que pide Aplicar). Y nunca dos a la vez del
 * mismo canal: si Agustín y Twai entran juntos, lee uno y el otro espera el resultado. En ML cada
 * lectura son unas tres consultas por publicación, así que repetirla de más gasta cupo de la API.
 *
 * El turno y la fecha de la última lectura terminada viven en `config_tenant.data`. El turno vence
 * solo a los 6 minutos (la lectura tiene 5 de límite), por si una se corta sin soltarlo.
 */

export type CanalLeido = "mercadolibre" | "shop";

const enCurso = (c: CanalLeido) => `lectura_${c}_en_curso`;
const hecha = (c: CanalLeido) => `lectura_${c}_hecha`;

/** La última lectura terminada de ese canal, o null si nunca terminó una desde que existe esto. */
export async function ultimaLectura(tenantId: string, canal: CanalLeido): Promise<{ hecha: Date | null; enCurso: boolean }> {
  const [f] = await prisma.$queryRaw<Array<{ hecha: string | null; en_curso: string | null }>>`
    SELECT data->>${hecha(canal)} AS hecha, data->>${enCurso(canal)} AS en_curso
      FROM public.config_tenant WHERE tenant_id = ${tenantId}`;
  const t = f?.hecha ? new Date(f.hecha) : null;
  const c = f?.en_curso ? new Date(f.en_curso) : null;
  return { hecha: t && !isNaN(t.getTime()) ? t : null, enCurso: !!c && Date.now() - c.getTime() < 6 * 60 * 1000 };
}

/** Si conviene leer sola: la última lectura terminada tiene más de una hora (o no hay). */
export function estaVieja(hechaEn: Date | null, ahora = Date.now()): boolean {
  return !hechaEn || ahora - hechaEn.getTime() > LECTURA_VIGENTE_MS;
}

/** Toma el turno de lectura del canal. Devuelve false si otro lo tiene. Atómico: un solo UPDATE. */
export async function tomarTurno(tenantId: string, canal: CanalLeido): Promise<boolean> {
  const k = enCurso(canal);
  const filas = await prisma.$queryRaw<Array<{ id: string }>>`
    INSERT INTO public.config_tenant (id, tenant_id, data)
    VALUES (gen_random_uuid()::text, ${tenantId}, jsonb_build_object(${k}::text, now()::text))
    ON CONFLICT (tenant_id) DO UPDATE
      SET data = config_tenant.data || jsonb_build_object(${k}::text, now()::text)
      WHERE config_tenant.data->>${k} IS NULL
         OR (config_tenant.data->>${k})::timestamptz < now() - interval '6 minutes'
    RETURNING id`;
  return filas.length > 0;
}

/** Suelta el turno; si la lectura terminó, deja anotada la hora. */
export async function soltarTurno(tenantId: string, canal: CanalLeido, termino: boolean): Promise<void> {
  if (termino) {
    await prisma.$executeRaw`
      UPDATE public.config_tenant
         SET data = (data - ${enCurso(canal)}::text) || jsonb_build_object(${hecha(canal)}::text, now()::text)
       WHERE tenant_id = ${tenantId}`;
  } else {
    await prisma.$executeRaw`
      UPDATE public.config_tenant SET data = data - ${enCurso(canal)}::text WHERE tenant_id = ${tenantId}`;
  }
}
