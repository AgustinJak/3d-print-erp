import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Parsea un monto escrito a la argentina: el punto es separador de miles y la
 * coma es el decimal.
 *
 *   parsePrice("30.995")  → 30995
 *   parsePrice("7.500")   → 7500
 *   parsePrice("1.234,56")→ 1234.56
 *
 * `parseFloat` a secas lee el punto como decimal, así que "7.500" daba 7.5 y el
 * costo quedaba dividido por mil sin que nadie se enterara. Usar SIEMPRE esto
 * para montos que vengan de un input de texto.
 */
export function parsePrice(valor: string | number | null | undefined): number {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;
  if (valor == null) return 0;
  const t = String(valor).trim().replace(/\s/g, "").replace(/^\$/, "");
  let limpio: string;
  if (t.includes(",")) {
    // Como se escribe acá: punto de miles y coma decimal ("12.500,50").
    limpio = t.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) {
    // Sólo puntos de miles ("12.500", "1.250.000").
    limpio = t.replace(/\./g, "");
  } else {
    // Un punto decimal, como lo devuelve la base o un campo numérico ("19911.9").
    limpio = t;
  }
  const n = parseFloat(limpio);
  return Number.isFinite(n) ? n : 0;
}
