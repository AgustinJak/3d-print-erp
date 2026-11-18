/**
 * Ajustes de precio por producto (docs/sdd/015, spec 001). Puro: lo usan el cálculo de precios, la
 * API y la pantalla.
 *
 * - **% por canal**: +3 = 3 % más sobre el precio que calcula el motor en ese canal; se vuelve a
 *   redondear como siempre. En ML, el precio publicado se recalcula con la promo encima. La
 *   ganancia que se copia entre canales es la de antes del ajuste.
 * - **Envío propio**: lo que cuesta mandar ese producto, en ML y en la web. En ML cuenta sólo
 *   cuando el envío lo pagás vos (envío gratis), igual que el costo general.
 * - Con **fecha de fin** opcional: vencido, se ignora (RN-2).
 */

export type CanalAjuste = "ml" | "web" | "personalizado";
export type TipoAjuste = "porcentaje" | "envio";

export const CANALES_AJUSTE: CanalAjuste[] = ["ml", "web", "personalizado"];
export const NOMBRE_CANAL: Record<CanalAjuste, string> = { ml: "ML", web: "web", personalizado: "venta directa" };

export interface Ajuste {
  canal: CanalAjuste;
  tipo: TipoAjuste;
  valor: number;
  /** ISO; null = sin fecha de fin. */
  hasta: string | null;
  nota: string | null;
}

/** Lo que el cálculo necesita de un producto: los ajustes vigentes, ya resumidos. */
export interface ResumenAjustes {
  pct: Partial<Record<CanalAjuste, number>>;
  envio: Partial<Record<"ml" | "web", number>>;
}

export const SIN_AJUSTES: ResumenAjustes = { pct: {}, envio: {} };

export const vigente = (a: Pick<Ajuste, "hasta">, ahora = new Date()) => !a.hasta || new Date(a.hasta).getTime() > ahora.getTime();

export function resumir(ajustes: Ajuste[], ahora = new Date()): ResumenAjustes {
  const r: ResumenAjustes = { pct: {}, envio: {} };
  for (const a of ajustes) {
    if (!vigente(a, ahora) || !Number.isFinite(a.valor)) continue;
    if (a.tipo === "porcentaje" && a.valor !== 0) r.pct[a.canal] = a.valor;
    if (a.tipo === "envio" && a.canal !== "personalizado" && a.valor >= 0) r.envio[a.canal] = a.valor;
  }
  return r;
}

export const hayAjustes = (r: ResumenAjustes | null | undefined) => !!r && (Object.keys(r.pct).length > 0 || Object.keys(r.envio).length > 0);

/** El precio con el %; sin % (o 0), el mismo. Quien llama lo vuelve a redondear. */
export const conPorcentaje = (precio: number, pct: number | undefined) => (pct ? precio * (1 + pct / 100) : precio);

/** null si está bien; si no, qué está mal, para mostrar. */
export function validarAjuste(a: { canal?: unknown; tipo?: unknown; valor?: unknown; hasta?: unknown }): string | null {
  if (!CANALES_AJUSTE.includes(a.canal as CanalAjuste)) return "El canal tiene que ser ML, web o venta directa";
  if (a.tipo !== "porcentaje" && a.tipo !== "envio") return "El ajuste es un % o un envío";
  if (a.tipo === "envio" && a.canal === "personalizado") return "La venta directa no lleva envío";
  const v = Number(a.valor);
  if (!Number.isFinite(v)) return "Falta el valor";
  if (a.tipo === "porcentaje" && (v <= -90 || v > 500)) return "El % tiene que estar entre -90 y 500";
  if (a.tipo === "envio" && (v < 0 || v > 10_000_000)) return "El envío tiene que ser un monto positivo";
  if (a.hasta != null && a.hasta !== "" && Number.isNaN(new Date(String(a.hasta)).getTime())) return "La fecha de fin no es válida";
  return null;
}

/** "+3 % web · hasta 30/11", "envío ML $12.000", "vencido". La firma de la pantalla (spec 002). */
export function textoDeAjuste(a: Ajuste, ahora = new Date()): string {
  const valor =
    a.tipo === "porcentaje"
      ? `${a.valor > 0 ? "+" : ""}${String(a.valor).replace(".", ",")} % ${NOMBRE_CANAL[a.canal]}`
      : `envío ${NOMBRE_CANAL[a.canal]} $${Math.round(a.valor).toLocaleString("es-AR")}`;
  if (!a.hasta) return valor;
  const f = new Date(a.hasta);
  const dia = f.toLocaleDateString("es-AR", { day: "numeric", month: "numeric", timeZone: "America/Argentina/Buenos_Aires" });
  return vigente(a, ahora) ? `${valor} · hasta ${dia}` : `${valor} · venció el ${dia}`;
}
