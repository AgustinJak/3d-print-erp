import { cargarContextoDePrecios, preciosDeCombinaciones, type PrecioDeCombinacion } from "@/lib/precios-combinacion";
import { SIN_AJUSTES, validarAjuste, type ResumenAjustes } from "@/lib/ajustes-precio-reglas";
import type { EntradaAjuste } from "@/lib/ajustes-precio";

/**
 * La vista previa de un ajuste (docs/sdd/015, RN-5): el precio de hoy y el nuevo de cada producto
 * en cada canal, sin guardar nada. Se calcula con el mismo motor, con el ajuste puesto a mano en
 * el contexto. De cada producto se muestra su combinación base (la más barata en venta directa).
 */

export interface FilaVistaPrevia {
  modeloId: string;
  nombre: string;
  hoy: { ml: number; web: number; personalizado: number } | null;
  nuevo: { ml: number; web: number; personalizado: number } | null;
}

const tres = (p: PrecioDeCombinacion | undefined) => (p?.precios ? { ml: p.precios.mlPublicado, web: p.precios.web, personalizado: p.precios.personalizado } : null);

function basePorModelo(l: PrecioDeCombinacion[]): Map<string, PrecioDeCombinacion> {
  const out = new Map<string, PrecioDeCombinacion>();
  for (const c of l) {
    const ya = out.get(c.modeloId);
    if (!ya || (c.precios && (!ya.precios || c.precios.personalizado < ya.precios.personalizado))) out.set(c.modeloId, c);
  }
  return out;
}

export async function vistaPreviaAjuste(tenantId: string, e: EntradaAjuste & { borrar?: boolean }): Promise<{ filas: FilaVistaPrevia[] } | { error: string }> {
  if (!e.borrar) {
    const error = validarAjuste(e);
    if (error) return { error };
  }
  const ids = [...new Set(e.modeloIds ?? [])].slice(0, 300);
  if (!ids.length) return { error: "Elegí al menos un producto" };
  const cx = await cargarContextoDePrecios(tenantId);
  if (!cx.erp) return { error: "Los ajustes necesitan la configuración de precios del ERP" };

  const antes = basePorModelo(await preciosDeCombinaciones(tenantId, { modeloIds: ids }, cx));
  const modelos = new Map(cx.erp.modelos);
  for (const id of ids) {
    const m = modelos.get(id);
    if (!m) continue;
    const r: ResumenAjustes = { pct: { ...(m.ajustes ?? SIN_AJUSTES).pct }, envio: { ...(m.ajustes ?? SIN_AJUSTES).envio } };
    if (e.tipo === "porcentaje") {
      if (e.borrar) delete r.pct[e.canal];
      else r.pct[e.canal] = Number(e.valor);
    } else if (e.canal !== "personalizado") {
      if (e.borrar) delete r.envio[e.canal];
      else r.envio[e.canal] = Number(e.valor);
    }
    modelos.set(id, { ...m, ajustes: r });
  }
  const despues = basePorModelo(await preciosDeCombinaciones(tenantId, { modeloIds: ids }, { ...cx, erp: { ...cx.erp, modelos } }));
  return {
    filas: ids
      .filter((id) => antes.has(id) || despues.has(id))
      .map((id) => ({ modeloId: id, nombre: (antes.get(id) ?? despues.get(id))!.modelo, hoy: tres(antes.get(id)), nuevo: tres(despues.get(id)) }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
  };
}
