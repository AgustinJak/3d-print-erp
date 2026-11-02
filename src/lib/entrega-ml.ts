/**
 * Tipos y reglas de la entrega de ML (Flex y tiempo de disponibilidad) que usan el servidor y la
 * pantalla. El que habla con ML es `flex-ml.ts`; acá no hay nada de servidor.
 */

export const DIAS_MAX = 60;

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

export type Entrega = { modo: "inmediata" } | { modo: "a_pedido"; dias: number };

/** Lo que haría falta mandar para llevar una publicación al modo pedido. Vacío = ya está. */
export function pasosPara(e: Pick<EstadoFlex, "flex" | "dias">, entrega: Entrega): string[] {
  const p: string[] = [];
  if (entrega.modo === "inmediata") {
    if (e.dias != null) p.push("sacar disponibilidad");
    if (!e.flex) p.push("prender Flex");
  } else {
    if (e.flex) p.push("apagar Flex");
    if (e.dias !== entrega.dias) p.push(`poner ${entrega.dias} días`);
  }
  return p;
}
