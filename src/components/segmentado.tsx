"use client";

import { useId } from "react";
import { motion } from "motion/react";

/**
 * Un control de opciones excluyentes (pestañas, filtros) con la marca que se desliza a la elegida
 * (docs/sdd/011). Mismo estilo que el selector de cuenta, para que el ERP se lea igual en todos lados.
 */
export function Segmentado<T extends string>({
  valor,
  opciones,
  onChange,
  etiqueta,
  chico,
  className = "",
}: {
  valor: T;
  opciones: ReadonlyArray<readonly [T, React.ReactNode]>;
  onChange: (v: T) => void;
  etiqueta: string;
  chico?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <div role="tablist" aria-label={etiqueta} className={`inline-flex max-w-full items-center overflow-x-auto rounded-[10px] border bg-muted/60 p-0.5 ${chico ? "text-xs" : "text-sm"} ${className}`}>
      {opciones.map(([v, texto]) => {
        const puesta = v === valor;
        return (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={puesta}
            onClick={() => onChange(v)}
            className={`relative inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${chico ? "h-7" : "h-8"} ${puesta ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {puesta && <motion.span layoutId={`seg-${id}`} className="absolute inset-0 rounded-md bg-background shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-border" transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }} />}
            <span className={`relative whitespace-nowrap ${puesta ? "font-medium" : ""}`}>{texto}</span>
          </button>
        );
      })}
    </div>
  );
}
