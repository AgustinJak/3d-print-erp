import { prisma } from "@/lib/prisma";
import { leerBusquedasMl } from "@/lib/tendencias-ml";
import { sincronizarCalendario } from "@/lib/tendencias-calendario";

/**
 * Una vuelta de Tendencias (docs/sdd/016): las búsquedas de ML y el calendario. Cada fuente en su
 * `try`: si una se cae, las otras siguen y la pantalla muestra la última foto con su fecha (RN-2).
 * El resumen queda en `config_tenant.data.tendencias_sync` para el pie de la pantalla.
 */
export async function sincronizarTendencias(): Promise<Record<string, unknown>> {
  const resumen: Record<string, unknown> = {};
  try {
    const r = await leerBusquedasMl();
    resumen.ml = { categorias: r.categorias, conDatos: r.conDatos, palabras: r.palabras, errores: r.errores.length };
  } catch (e) {
    resumen.ml = { error: e instanceof Error ? e.message.slice(0, 200) : String(e) };
  }
  try {
    resumen.calendario = await sincronizarCalendario();
  } catch (e) {
    resumen.calendario = { error: e instanceof Error ? e.message.slice(0, 200) : String(e) };
  }
  const v = JSON.stringify({ hora: new Date().toISOString(), resumen });
  await prisma.$executeRaw`
    INSERT INTO public.config_tenant (id, tenant_id, data)
    VALUES (gen_random_uuid()::text, 'sendero3d', jsonb_build_object('tendencias_sync', ${v}::jsonb))
    ON CONFLICT (tenant_id) DO UPDATE SET data = config_tenant.data || jsonb_build_object('tendencias_sync', ${v}::jsonb)`;
  return resumen;
}
