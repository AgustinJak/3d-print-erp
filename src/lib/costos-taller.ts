import type { ParametrosCosto } from "@/lib/costos-formula";
import { parsePrice } from "@/lib/utils";

/** Lo de los costos de fabricación que no toca la base: lo usan el servidor y la pantalla. */

/** Los campos del taller que se editan acá. El precio por kilo va en cada material. */
export const CAMPOS_DEL_TALLER = [
  { campo: "precioKwh", etiqueta: "Luz", unidad: "$ el kWh", min: 0, max: 100_000, ayuda: "Lo que pagás el kWh, con impuestos." },
  { campo: "consumoW", etiqueta: "Consumo de la impresora", unidad: "W", min: 1, max: 5_000, ayuda: "El promedio mientras imprime." },
  { campo: "precioRepuestos", etiqueta: "Repuestos", unidad: "$", min: 0, max: 100_000_000, ayuda: "Lo que gastás en repuestos a lo largo de la vida útil." },
  { campo: "desgasteHoras", etiqueta: "Vida útil", unidad: "horas", min: 1, max: 1_000_000, ayuda: "Horas de impresión hasta cambiar esos repuestos." },
  { campo: "margenError", etiqueta: "Margen de error", unidad: "%", min: 0, max: 100, ayuda: "Lo que se suma por fallas y material perdido." },
] as const satisfies ReadonlyArray<{ campo: keyof ParametrosCosto; etiqueta: string; unidad: string; min: number; max: number; ayuda: string }>;

export type CampoDelTaller = (typeof CAMPOS_DEL_TALLER)[number]["campo"];

/** Un número que llega como número o escrito a la argentina ("18.000", "0,5"). */
export function numeroEscrito(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && /\d/.test(v)) return parsePrice(v);
  return null;
}

/** Valida los campos del taller que vengan; los que no vienen no se tocan. */
export function validarTaller(c: Record<string, unknown>): { cambios: Partial<Record<CampoDelTaller, number>> } | { error: string } {
  const cambios: Partial<Record<CampoDelTaller, number>> = {};
  for (const d of CAMPOS_DEL_TALLER) {
    if (!(d.campo in c)) continue;
    const n = numeroEscrito(c[d.campo]);
    if (n == null || n < d.min || n > d.max) return { error: `${d.etiqueta}: tiene que ir de ${d.min.toLocaleString("es-AR")} a ${d.max.toLocaleString("es-AR")} ${d.unidad}` };
    cambios[d.campo] = n;
  }
  return { cambios };
}

