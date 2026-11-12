/**
 * Tipos y reglas de la entrega de ML (Flex y tiempo de disponibilidad) que usan el servidor y la
 * pantalla. El que habla con ML es `flex-ml.ts`; acá no hay nada de servidor.
 */

export const DIAS_MAX = 60;
/** Con los que arranca "a pedido" (Agustín, 2026-11-02); se cambian en el diálogo. */
export const DIAS_POR_DEFECTO = 2;

export interface EstadoFlex {
  mla: string;
  titulo: string | null;
  /** null = no se pudo leer. */
  flex: boolean | null;
  /** ML ofrece Flex para esta publicación (`self_service_available` o `_in`). */
  disponible: boolean;
  /** Días de disponibilidad de stock (`MANUFACTURING_TIME`); null = entrega inmediata. */
  dias: number | null;
  /** Stock del ERP de la combinación enlazada; null = sin fila de stock. Es una pista, no manda. */
  stockErp: number | null;
}

export interface ResultadoFlex extends EstadoFlex {
  estado: "aplicado" | "sin_efecto" | "error";
  motivo: string | null;
}

/**
 * "a_pedido" con 0 días es sin Flex y sin tiempo de disponibilidad: entrega inmediata por el envío
 * común de ML (Agustín, 2026-11-10).
 */
export type Entrega = { modo: "inmediata" } | { modo: "a_pedido"; dias: number };

/** Los días que tiene que quedar con esa entrega; null = sin tiempo de disponibilidad. */
export const diasDe = (entrega: Entrega): number | null => (entrega.modo === "inmediata" || entrega.dias === 0 ? null : entrega.dias);

/** Lo que haría falta mandar para llevar una publicación al modo pedido. Vacío = ya está. */
export function pasosPara(e: Pick<EstadoFlex, "flex" | "dias">, entrega: Entrega): string[] {
  const p: string[] = [];
  if (entrega.modo === "inmediata") {
    if (e.dias != null) p.push("sacar disponibilidad");
    if (!e.flex) p.push("prender Flex");
  } else {
    if (e.flex) p.push("apagar Flex");
    const dias = diasDe(entrega);
    if (e.dias !== dias) p.push(dias == null ? "sacar disponibilidad" : `poner ${dias} días`);
  }
  return p;
}
