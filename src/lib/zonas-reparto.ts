import { prisma } from "@/lib/prisma";
import { normalizar } from "@/lib/temas";

/**
 * La zona del repartidor de una dirección (docs/sdd/018, spec 001).
 *
 * El mapa de SyB razona por partido, pero ML da la localidad ("Plátanos", "Florida Oeste") y el
 * código postal, no el partido. Orden:
 *   1. CABA: por provincia o por código postal 1000-1499.
 *   2. Las localidades que el mapa nombra sueltas (Tristán Suárez es de Ezeiza pero va en la 3;
 *      González Catán es La Matanza pero va en la 2): ganan sobre el partido.
 *   3. El partido: el de la localidad según georef (datos.gob.ar, la misma que usa el checkout de la
 *      web), guardado en `localidades_reparto` para no volver a preguntar.
 *   4. Si no se resuelve: sin zona, se elige a mano (RN-3).
 *
 * A georef sólo se le manda el nombre de la localidad, nunca la dirección.
 */

const TENANT = "sendero3d";
const CABA = new Set(["capital federal", "caba", "ciudad autonoma de buenos aires"]);

export interface ZonaParaResolver {
  id: string;
  nombre: string;
  precio: number;
  partidos: string[];
  localidades: string[];
  codigosPostales: string | null;
}

export interface DireccionParaZona {
  provincia?: string | null;
  localidad?: string | null;
  cp?: string | null;
}

/** "C1414ABC" o "1414" → 1414. */
export function cpNumero(cp: string | null | undefined): number | null {
  const m = /(\d{4})/.exec(cp ?? "");
  return m ? Number(m[1]) : null;
}

function enRangos(cp: number, rangos: string | null): boolean {
  for (const parte of (rangos ?? "").split(",")) {
    const [a, b] = parte.split("-").map((x) => Number(x.trim()));
    if (!Number.isFinite(a)) continue;
    if (Number.isFinite(b) ? cp >= a && cp <= b : cp === a) return true;
  }
  return false;
}

/** Puro: la zona con lo que se sabe. `partido` lo da quien llama (georef o el cache). */
export function zonaPorDatos(d: DireccionParaZona, zonas: ZonaParaResolver[], partido: string | null): ZonaParaResolver | null {
  const provincia = normalizar(d.provincia ?? "");
  const localidad = normalizar(d.localidad ?? "");
  const cp = cpNumero(d.cp);

  const caba = zonas.find((z) => z.partidos.some((p) => CABA.has(p)));
  if (caba && (CABA.has(provincia) || (cp != null && enRangos(cp, caba.codigosPostales)))) return caba;

  if (localidad) {
    const suelta = zonas.find((z) => z.localidades.includes(localidad));
    if (suelta) return suelta;
  }
  const p = normalizar(partido ?? "");
  if (p) {
    const porPartido = zonas.find((z) => z.partidos.includes(p));
    if (porPartido) return porPartido;
  }
  // Sin partido: a veces la localidad es el partido ("Tres de febrero", "Quilmes").
  if (localidad) return zonas.find((z) => z.partidos.includes(localidad)) ?? null;
  return null;
}

/** El partido de una localidad de la provincia de Buenos Aires: el cache, o georef. */
export async function partidoDe(localidad: string | null | undefined, zonas: ZonaParaResolver[]): Promise<string | null> {
  const n = normalizar(localidad ?? "");
  if (!n) return null;
  const guardada = await prisma.localidadReparto.findUnique({ where: { tenantId_normalizada: { tenantId: TENANT, normalizada: n } } });
  if (guardada) return guardada.partido;

  let partido: string | null = null;
  try {
    const url = `https://apis.datos.gob.ar/georef/api/localidades?nombre=${encodeURIComponent(localidad!)}&provincia=buenos%20aires&campos=departamento.nombre&max=5`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (r.ok) {
      const j = (await r.json()) as { localidades?: Array<{ departamento?: { nombre?: string } }> };
      const deptos = (j.localidades ?? []).map((l) => normalizar(l.departamento?.nombre ?? "")).filter(Boolean);
      const conocidos = new Set(zonas.flatMap((z) => z.partidos));
      partido = deptos.find((d) => conocidos.has(d)) ?? deptos[0] ?? null;
    } else {
      return null; // georef no contestó: no se guarda, se vuelve a probar.
    }
  } catch {
    return null;
  }
  await prisma.localidadReparto.upsert({
    where: { tenantId_normalizada: { tenantId: TENANT, normalizada: n } },
    create: { normalizada: n, partido, fuente: "georef" },
    update: {},
  });
  return partido;
}

export async function zonasActivas(): Promise<ZonaParaResolver[]> {
  const zs = await prisma.zonaReparto.findMany({ where: { tenantId: TENANT, activo: true }, orderBy: { orden: "asc" } });
  return zs.map((z) => ({ id: z.id, nombre: z.nombre, precio: Number(z.precio), partidos: z.partidos, localidades: z.localidades, codigosPostales: z.codigosPostales }));
}

/** La zona de una dirección, resolviendo el partido si hace falta. */
export async function zonaDe(d: DireccionParaZona, zonas: ZonaParaResolver[]): Promise<ZonaParaResolver | null> {
  const sinPartido = zonaPorDatos(d, zonas, null);
  if (sinPartido && (CABA.has(normalizar(d.provincia ?? "")) || zonas.some((z) => z.id === sinPartido.id && z.localidades.includes(normalizar(d.localidad ?? ""))))) {
    return sinPartido;
  }
  const partido = await partidoDe(d.localidad, zonas);
  return zonaPorDatos(d, zonas, partido) ?? sinPartido;
}
