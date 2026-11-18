import { CAMBIO_GRANDE_PCT, conDiferencia, esGrande, PREFIJO_FALTA } from "@/lib/precios-reglas";
import type { FilaDeCanal, FilaErp, Propuesta } from "@/lib/precios-propuesta";
import type { PrecioDeCombinacion } from "@/lib/precios-combinacion";
import type { AjusteGuardado } from "@/lib/ajustes-precio";
import { vigente } from "@/lib/ajustes-precio-reglas";

/**
 * Precios por producto (docs/sdd/015): la propuesta, que viene por canal, reagrupada para que cada
 * producto sea una fila con sus tres canales y una ficha con todo lo suyo.
 */

/** Una fila para aplicar, sea de un canal o del ERP. */
export interface Aplicable {
  clave: string;
  nombre: string;
  antes: number | null;
  despues: number;
  pct: number | null;
  /** Por qué pide la confirmación aparte; null = no la pide. */
  aparte: string | null;
}

export interface Producto {
  id: string;
  nombre: string;
  foto: string | null;
  ajustes: AjusteGuardado[];
  combinaciones: PrecioDeCombinacion[];
  /** La combinación que se muestra en la lista: la de venta directa más barata con precio. */
  base: PrecioDeCombinacion | null;
  ml: FilaDeCanal[];
  web: FilaDeCanal[];
  erp: FilaErp | null;
  /** Lo que se puede aplicar hoy en cada canal. */
  pendientes: { ml: FilaDeCanal[]; web: FilaDeCanal[]; erp: FilaErp | null };
  faltaCostear: boolean;
}

export const sePuedeMl = (f: FilaDeCanal) => !f.motivo && !f.ignorada && conDiferencia(f);
export const erpConCambio = (f: FilaErp) => !f.motivo && (conDiferencia(f) || f.adicionales.some((a) => Math.abs(a.propuesto - a.actual) > 1));

export const aplicableDeCanal = (f: FilaDeCanal): Aplicable => ({ clave: f.clave, nombre: f.combinacion ?? f.clave, antes: f.publicado, despues: f.propuesto!, pct: f.pct, aparte: f.aparte });
export const aplicableDeErp = (f: FilaErp): Aplicable => ({
  clave: f.modeloId,
  nombre: f.modelo,
  antes: f.actual,
  despues: f.propuesto!,
  pct: f.pct,
  aparte: esGrande(f.pct) ? `cambia más de ${CAMBIO_GRANDE_PCT} %` : null,
});

/** En la web va el producto entero: todas sus combinaciones que el Shop no ignora. */
export const webEntera = (web: FilaDeCanal[]) => web.filter((f) => !f.ignorada && f.propuesto != null);

export function agrupar(datos: Propuesta, cuentaMl: "todas" | "principal" | "otra"): Producto[] {
  const ids = new Set<string>();
  for (const c of datos.combinaciones) ids.add(c.modeloId);
  for (const e of datos.erp) ids.add(e.modeloId);
  for (const f of datos.canales) if (f.modeloId) ids.add(f.modeloId);

  const porId = <T,>(l: T[], id: (x: T) => string | null) => {
    const m = new Map<string, T[]>();
    for (const x of l) {
      const k = id(x);
      if (k) m.set(k, [...(m.get(k) ?? []), x]);
    }
    return m;
  };
  const combs = porId(datos.combinaciones, (c) => c.modeloId);
  const ml = porId(
    datos.canales.filter((f) => f.canal === "mercadolibre" && (cuentaMl === "todas" || f.cuentaMl === cuentaMl)),
    (f) => f.modeloId
  );
  const web = porId(
    datos.canales.filter((f) => f.canal === "shop"),
    (f) => f.modeloId
  );
  const erp = new Map(datos.erp.map((e) => [e.modeloId, e]));

  return [...ids].map((id) => {
    const cs = combs.get(id) ?? [];
    const conPrecio = cs.filter((c) => c.precios);
    const base = conPrecio.reduce<PrecioDeCombinacion | null>((min, c) => (!min || c.precios!.personalizado < min.precios!.personalizado ? c : min), null);
    const filasMl = ml.get(id) ?? [];
    const filasWeb = web.get(id) ?? [];
    const e = erp.get(id) ?? null;
    const info = datos.productos[id];
    return {
      id,
      nombre: info?.nombre ?? cs[0]?.modelo ?? e?.modelo ?? filasMl[0]?.combinacion ?? "Producto",
      foto: info?.foto ?? null,
      ajustes: info?.ajustes ?? [],
      combinaciones: cs,
      base,
      ml: filasMl,
      web: filasWeb,
      erp: e,
      pendientes: {
        ml: filasMl.filter(sePuedeMl),
        web: filasWeb.some((f) => !f.motivo && !f.ignorada && conDiferencia(f)) ? webEntera(filasWeb) : [],
        erp: e && erpConCambio(e) ? e : null,
      },
      faltaCostear: cs.length > 0 && conPrecio.length < cs.length,
    };
  });
}

export const hayPendientes = (p: Producto) => p.pendientes.ml.length > 0 || p.pendientes.web.length > 0 || !!p.pendientes.erp;
export const ajustesVigentes = (p: Producto) => p.ajustes.filter((a) => vigente(a));

/** Lo que dice el estado de un canal en una línea. */
export function estadoDeCanal(filas: FilaDeCanal[], pendientes: number): { texto: string; tono: "accion" | "quieto" | "aviso" } {
  if (!filas.length) return { texto: "sin publicar", tono: "quieto" };
  if (pendientes > 0) return { texto: filas.length === 1 ? "por actualizar" : `${pendientes} de ${filas.length} por actualizar`, tono: "accion" };
  if (filas.every((f) => f.motivo?.startsWith(PREFIJO_FALTA))) return { texto: "falta costear", tono: "aviso" };
  if (filas.some((f) => f.motivo === "falta mapear")) return { texto: "falta mapear", tono: "aviso" };
  return { texto: filas.length === 1 ? "al día" : `${filas.length} al día`, tono: "quieto" };
}

export const pct = (n: number | null) => (n == null ? "" : `${n > 0 ? "+" : ""}${n.toFixed(1).replace(".", ",")} %`);

export function haceCuanto(iso: string | null): string {
  if (!iso) return "nunca";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`;
}
