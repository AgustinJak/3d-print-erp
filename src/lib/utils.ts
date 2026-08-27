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
  const limpio = String(valor).trim().replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(limpio);
  return Number.isFinite(n) ? n : 0;
}
