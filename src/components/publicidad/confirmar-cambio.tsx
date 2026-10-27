"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight, Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { json, pedir, pesos } from "@/components/producto/seccion";
import { decimal } from "@/lib/publicidad-reglas";
import type { PedidoDeCambio, ResultadoCambio, VistaPrevia } from "@/lib/publicidad-ml";

/**
 * La vista previa de un cambio de Product Ads y el botón que lo manda (docs/sdd/005, spec 002).
 *
 * Lo que se compara viene de ML en este momento, no de lo que tenía cargado la pantalla. Lo que
 * pide confirmación aparte (un presupuesto que cambia mucho, una campaña de Shay) no se puede
 * mandar sin tildarlo.
 */

function valor(campo: string, v: string | number | null): string {
  if (v == null) return "—";
  if (campo === "budget" && typeof v === "number") return `${pesos(v)} por día`;
  if (campo === "roas_target" && typeof v === "number") return `${decimal(v)}×`;
  return String(v);
}

export function ConfirmarCambio({
  pedido,
  onVolver,
  onCerrar,
  onAplicado,
}: {
  pedido: PedidoDeCambio;
  /** Si viene, muestra "Volver" en vez de "Cancelar" (para corregir el formulario). */
  onVolver?: () => void;
  onCerrar: () => void;
  onAplicado: () => void;
}) {
  const [vista, setVista] = useState<VistaPrevia | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aparteOk, setAparteOk] = useState(false);
  const [aplicando, setAplicando] = useState(false);

  useEffect(() => {
    let vigente = true;
    pedir<{ vista: VistaPrevia }>("/api/publicidad/cambios", json("POST", { ...pedido, aplicar: false }))
      .then((r) => vigente && setVista(r.vista))
      .catch((e) => vigente && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      vigente = false;
    };
  }, [pedido]);

  async function aplicar() {
    setAplicando(true);
    try {
      const r = await fetch("/api/publicidad/cambios", json("POST", { ...pedido, aplicar: true, confirmadoAparte: aparteOk }));
      const data = (await r.json().catch(() => ({}))) as Partial<ResultadoCambio> & { error?: string };
      if (data.estado === "aplicado") {
        toast.success("Cambio aplicado en Mercado Libre");
        onAplicado();
      } else {
        toast.error(`Mercado Libre no lo tomó: ${"motivo" in data ? data.motivo : (data.error ?? `error ${r.status}`)}`);
      }
    } catch (e) {
      toast.error(`No se pudo mandar: ${e instanceof Error ? e.message : e}`);
    } finally {
      setAplicando(false);
    }
  }

  const aparte = vista?.avisos.filter((a) => a.aparte) ?? [];
  const otros = vista?.avisos.filter((a) => !a.aparte) ?? [];
  const puede = !!vista && !vista.errores.length && (!aparte.length || aparteOk);

  return (
    <div className="space-y-4">
      {!vista && !error && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Leyendo cómo está ahora en Mercado Libre…
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {vista && (
        <>
          {vista.cambios.length > 0 && (
            <div className="rounded-lg border divide-y">
              {vista.cambios.map((c) => (
                <div key={c.campo} className="grid grid-cols-[1fr_auto] gap-3 px-3 py-2.5 text-sm items-center">
                  <span className="text-muted-foreground">{c.etiqueta}</span>
                  <span className="flex items-center gap-2 tabular-nums">
                    <span className="text-muted-foreground line-through decoration-muted-foreground/40">{valor(c.campo, c.antes)}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium">{valor(c.campo, c.despues)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}

          {vista.errores.map((e) => (
            <p key={e} className="text-sm text-destructive">
              {e}
            </p>
          ))}

          {otros.map((a) => (
            <p key={a.texto} className="flex items-start gap-2 rounded-md bg-amber-500/10 text-amber-800 dark:text-amber-300 px-3 py-2 text-sm">
              <Info className="h-4 w-4 mt-0.5 shrink-0" /> {a.texto}
            </p>
          ))}

          {aparte.length > 0 && (
            <label className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm cursor-pointer">
              <input type="checkbox" className="mt-0.5" checked={aparteOk} onChange={(e) => setAparteOk(e.target.checked)} />
              <span>
                <AlertTriangle className="inline h-3.5 w-3.5 mr-1 text-destructive" />
                {aparte.map((a) => a.texto).join(" ")} Lo revisé y quiero aplicarlo igual.
              </span>
            </label>
          )}

          <p className="text-xs text-muted-foreground">Se manda a Mercado Libre en el momento y queda en el historial.</p>
        </>
      )}

      <DialogFooter>
        <Button variant="ghost" onClick={onVolver ?? onCerrar} disabled={aplicando}>
          {onVolver ? "Volver" : "Cancelar"}
        </Button>
        <Button onClick={aplicar} disabled={!puede || aplicando}>
          {aplicando && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
          Aplicar en Mercado Libre
        </Button>
      </DialogFooter>
    </div>
  );
}
