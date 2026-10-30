"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { json, pedir } from "@/components/producto/seccion";
import type { EstadoFlex, ResultadoFlex } from "@/lib/flex-ml";

/**
 * Prender o apagar Flex en varias publicaciones (docs/sdd/006, spec 007): primero cómo está cada
 * una en ML ahora, después se manda, se verifica en la publicación y queda registrado. De a 20.
 */
const TANDA = 20;
const ESTADO: Record<ResultadoFlex["estado"], { texto: string; clase: string }> = {
  aplicado: { texto: "Listo", clase: "text-emerald-600 dark:text-emerald-400" },
  sin_efecto: { texto: "No cambió", clase: "text-amber-600" },
  error: { texto: "Error", clase: "text-red-600 dark:text-red-400" },
};

export function ConfirmarFlex({ mlas, prender, onCerrar, onHecho }: { mlas: string[]; prender: boolean; onCerrar: () => void; onHecho: () => void }) {
  const [estados, setEstados] = useState<EstadoFlex[] | null>(null);
  const [resultados, setResultados] = useState<ResultadoFlex[] | null>(null);
  const [avance, setAvance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    (async () => {
      const todos: EstadoFlex[] = [];
      for (let i = 0; i < mlas.length; i += TANDA) {
        const r = await pedir<{ estados: EstadoFlex[] }>("/api/precios/flex", json("POST", { mlas: mlas.slice(i, i + TANDA), prender }));
        todos.push(...r.estados);
      }
      if (vigente) setEstados(todos);
    })().catch((e) => vigente && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      vigente = false;
    };
  }, [mlas, prender]);

  const mandar = estados?.filter((e) => e.flex !== prender && (!prender || e.disponible)) ?? [];

  async function aplicar() {
    const todos: ResultadoFlex[] = [];
    setAvance(0);
    try {
      for (let i = 0; i < mandar.length; i += TANDA) {
        const r = await pedir<{ resultados: ResultadoFlex[] }>("/api/precios/flex", json("POST", { mlas: mandar.slice(i, i + TANDA).map((e) => e.mla), prender, aplicar: true }));
        todos.push(...r.resultados);
        setAvance(todos.length);
      }
    } catch (e) {
      toast.error(`Se cortó a mitad de camino: ${e instanceof Error ? e.message : e}`);
    }
    setResultados(todos);
    setAvance(null);
    const ok = todos.filter((r) => r.estado === "aplicado").length;
    if (ok) toast.success(`Flex ${prender ? "prendido" : "apagado"} en ${ok} ${ok === 1 ? "publicación" : "publicaciones"}.`);
    onHecho();
  }

  if (error)
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-600 flex items-start gap-2">
          <XCircle className="h-4 w-4 mt-0.5 shrink-0" /> {error}
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>
            Cerrar
          </Button>
        </DialogFooter>
      </div>
    );
  if (!estados)
    return (
      <p className="text-sm text-muted-foreground flex items-center gap-2 py-6 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Mirando en Mercado Libre cómo está cada una…
      </p>
    );

  const filas: Array<EstadoFlex & { estado?: ResultadoFlex["estado"]; motivo?: string | null }> = resultados ?? estados;
  return (
    <div className="space-y-3">
      <div className="max-h-[50vh] overflow-y-auto rounded-md border divide-y text-sm">
        {filas.map((e) => {
          const nota =
            e.estado != null
              ? null
              : e.flex === prender
                ? prender
                  ? "ya tiene Flex"
                  : "ya está sin Flex"
                : prender && !e.disponible
                  ? "ML no ofrece Flex para esta publicación"
                  : null;
          return (
            <div key={e.mla} className={`px-3 py-2 flex items-center justify-between gap-2 ${nota ? "opacity-60" : ""}`}>
              <span className="min-w-0">
                <span className="block truncate">{e.titulo ?? e.mla}</span>
                <span className="text-xs text-muted-foreground">
                  {e.mla} · hoy {e.flex == null ? "no se pudo leer" : e.flex ? "con Flex" : "sin Flex"}
                  {nota ? ` · ${nota}` : ""}
                  {e.motivo ? ` · ${e.motivo}` : ""}
                </span>
              </span>
              {e.estado && <span className={`text-xs shrink-0 ${ESTADO[e.estado].clase}`}>{ESTADO[e.estado].texto}</span>}
            </div>
          );
        })}
      </div>
      {!resultados && (
        <p className="text-xs text-muted-foreground">
          {mandar.length
            ? `Se ${prender ? "prende" : "apaga"} Flex en ${mandar.length} de ${estados.length}. Cambia la promesa de entrega que ve el comprador.`
            : "Nada para cambiar."}
        </p>
      )}
      <DialogFooter>
        {resultados ? (
          <Button onClick={onCerrar}>Cerrar</Button>
        ) : (
          <>
            <Button variant="outline" onClick={onCerrar} disabled={avance != null}>
              Cancelar
            </Button>
            <Button onClick={aplicar} disabled={!mandar.length || avance != null}>
              {avance != null ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> {avance} de {mandar.length}
                </>
              ) : (
                `${prender ? "Prender" : "Apagar"} Flex en ${mandar.length}`
              )}
            </Button>
          </>
        )}
      </DialogFooter>
    </div>
  );
}
