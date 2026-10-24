"use client";

import { useEffect, type ReactNode } from "react";
import { Loader2, Pencil } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Una sección de la página del producto (docs/sdd/004, spec 002): se mira, se toca "Editar",
 * se cambia y se guarda sola, con su botón. Mientras haya cambios sin guardar, salir de la
 * página pide confirmación.
 */
export function Seccion({
  titulo,
  icono: Icono,
  editando,
  sucio = false,
  guardando = false,
  onEditar,
  onCancelar,
  onGuardar,
  acciones,
  children,
}: {
  titulo: string;
  icono?: LucideIcon;
  /** Sin `onEditar`, la sección no tiene modo edición (se cambia en el lugar). */
  editando?: boolean;
  sucio?: boolean;
  guardando?: boolean;
  onEditar?: () => void;
  onCancelar?: () => void;
  onGuardar?: () => void;
  /** Botones propios a la derecha del título, cuando no está editando. */
  acciones?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!sucio) return;
    const avisar = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [sucio]);

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0 gap-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          {Icono && <Icono className="h-4 w-4" />}
          {titulo}
        </CardTitle>
        <div className="flex items-center gap-1.5">
          {editando ? (
            <>
              <Button size="sm" variant="ghost" onClick={onCancelar} disabled={guardando}>
                Cancelar
              </Button>
              <Button size="sm" onClick={onGuardar} disabled={guardando || !sucio}>
                {guardando && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                Guardar
              </Button>
            </>
          ) : (
            <>
              {acciones}
              {onEditar && (
                <Button size="sm" variant="outline" onClick={onEditar}>
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Editar
                </Button>
              )}
            </>
          )}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** Una fila "etiqueta · valor" del modo lectura. */
export function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1 text-sm">
      <span className="text-muted-foreground shrink-0">{etiqueta}</span>
      <span className="text-right min-w-0 break-words">{children}</span>
    </div>
  );
}

export const pesos = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);

/** fetch que tira el mensaje del servidor si la respuesta no es ok. */
export async function pedir<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as { error?: string })?.error || `error ${r.status}`);
  return data as T;
}

export const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
