"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export interface Categoria {
  id: string;
  nombre: string;
  color: string | null;
}

/** Elegir varias categorías. Salió del diálogo del lápiz (docs/sdd/004). */
export function CategoriasMultiples({
  categorias,
  elegidas,
  onChange,
}: {
  categorias: Categoria[];
  elegidas: string[];
  onChange: (ids: string[]) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function cerrar(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", cerrar);
    return () => document.removeEventListener("mousedown", cerrar);
  }, []);

  const alternar = (id: string) => onChange(elegidas.includes(id) ? elegidas.filter((x) => x !== id) : [...elegidas, id]);
  const visibles = categorias.filter((c) => elegidas.includes(c.id));

  return (
    <div className="relative" ref={ref}>
      <div
        className="flex min-h-9 w-full cursor-pointer flex-wrap items-center gap-1 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
        onClick={() => setAbierto(!abierto)}
      >
        {visibles.length === 0 && <span className="text-muted-foreground">Elegir categorías…</span>}
        {visibles.map((c) => (
          <Badge key={c.id} variant="secondary" className="gap-1">
            {c.color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />}
            {c.nombre}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                alternar(c.id);
              }}
              className="ml-0.5 hover:text-destructive"
              aria-label={`Sacar ${c.nombre}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      {abierto && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover p-1 shadow-md max-h-48 overflow-y-auto">
          {categorias.map((c) => (
            <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
              <input
                type="checkbox"
                checked={elegidas.includes(c.id)}
                onChange={() => alternar(c.id)}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              {c.color && <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: c.color }} />}
              {c.nombre}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
