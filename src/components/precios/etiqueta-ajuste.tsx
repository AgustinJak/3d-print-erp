"use client";

import { textoDeAjuste, vigente, type Ajuste } from "@/lib/ajustes-precio-reglas";

/**
 * La firma de Precios (docs/sdd/015): un ajuste como una etiqueta chica con su fecha, igual en la
 * lista y en la ficha. El punto naranja dice que está corriendo; uno vencido queda gris y tachado.
 */
export function EtiquetaAjuste({ a, nota = true }: { a: Ajuste; nota?: boolean }) {
  const activo = vigente(a);
  return (
    <span
      className={`inline-flex h-6 items-center gap-1.5 rounded-md border px-2 text-xs whitespace-nowrap ${activo ? "text-foreground" : "text-muted-foreground line-through decoration-muted-foreground/50"}`}
      title={nota && a.nota ? a.nota : undefined}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${activo ? "bg-primary" : "bg-muted-foreground/40"}`} aria-hidden />
      {textoDeAjuste(a)}
    </span>
  );
}
