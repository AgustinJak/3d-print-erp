"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { json, pedir, pesos } from "@/components/producto/seccion";
import type { FilaDeMargen } from "@/lib/precios-config";

/**
 * Cambiar el margen de varios productos a la vez (docs/sdd/006, spec 002; Agustín, 2026-10-30).
 * Primero se ve cómo quedan sus combinaciones; guardar sólo cambia el margen del producto en el
 * ERP. Los precios nuevos se publican con "Aplicar", en cada canal.
 */
export function MargenMasivo({ modeloIds, onCerrar, onGuardado }: { modeloIds: string[]; onCerrar: () => void; onGuardado: () => void }) {
  const [margen, setMargen] = useState("40");
  const [general, setGeneral] = useState(false);
  const [filas, setFilas] = useState<{ margen: string; general: boolean; filas: FilaDeMargen[] } | null>(null);
  const [ocupado, setOcupado] = useState<"viendo" | "guardando" | null>(null);

  const valor = general ? null : Number(margen.replace(",", "."));
  const valido = general || (Number.isFinite(valor) && valor! >= 5 && valor! <= 80);
  const vigente = filas && filas.margen === margen && filas.general === general;

  async function ver() {
    setOcupado("viendo");
    try {
      const r = await pedir<{ filas: FilaDeMargen[] }>("/api/precios/margenes", json("POST", { modeloIds, margen: valor }));
      setFilas({ margen, general, filas: r.filas });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  }

  async function guardar() {
    setOcupado("guardando");
    try {
      const r = await pedir<{ guardados: number }>("/api/precios/margenes", json("POST", { modeloIds, margen: valor, aplicar: true }));
      toast.success(`Margen guardado en ${r.guardados} ${r.guardados === 1 ? "producto" : "productos"}. Los precios nuevos están en cada canal para aplicar.`);
      onGuardado();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  }

  const celda = (a: number | null | undefined, b: number | null | undefined) => (
    <span className="tabular-nums">
      {a == null ? "—" : pesos(a)}
      {b != null && a !== b && <span className="block font-medium">{pesos(b)}</span>}
    </span>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          Margen
          <Input value={margen} onChange={(e) => setMargen(e.target.value)} disabled={general} inputMode="decimal" className="w-20 h-8" />%
        </label>
        <label className="flex items-center gap-2 text-muted-foreground">
          <input type="checkbox" checked={general} onChange={(e) => setGeneral(e.target.checked)} /> volver al general
        </label>
        <Button size="sm" variant="outline" className="ml-auto" disabled={!valido || !!ocupado} onClick={ver}>
          {ocupado === "viendo" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Ver cómo queda
        </Button>
      </div>
      {!valido && <p className="text-xs text-red-600">El margen tiene que ir de 5 a 80 %.</p>}

      {filas && (
        <div className="max-h-[50vh] overflow-auto rounded-md border text-sm">
          <div className="grid grid-cols-[minmax(140px,2fr)_repeat(4,minmax(80px,1fr))] gap-2 px-3 py-2 text-xs text-muted-foreground border-b min-w-[520px] sticky top-0 bg-background">
            <span>Combinación</span>
            <span>ML publicado</span>
            <span>Web</span>
            <span>Personalizado</span>
            <span>Deja en ML</span>
          </div>
          {filas.filas.map((f) => (
            <div key={f.combinacionId} className="grid grid-cols-[minmax(140px,2fr)_repeat(4,minmax(80px,1fr))] gap-2 px-3 py-2 border-b last:border-0 min-w-[520px]">
              <span className="truncate">
                {f.producto}
                {f.antes && f.despues && (
                  <span className="block text-xs text-muted-foreground">
                    {f.antes.margen} % → {f.despues.margen} %
                  </span>
                )}
              </span>
              {f.antes ? (
                <>
                  {celda(f.antes.mlPublicado, f.despues?.mlPublicado)}
                  {celda(f.antes.web, f.despues?.web)}
                  {celda(f.antes.personalizado, f.despues?.personalizado)}
                  {celda(f.antes.ganancia, f.despues?.ganancia)}
                </>
              ) : (
                <span className="col-span-4 text-xs text-muted-foreground">sin costo: no tiene precio</span>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Guardar cambia el margen de {modeloIds.length} {modeloIds.length === 1 ? "producto" : "productos"} en el ERP. No publica nada: los precios nuevos aparecen en
        Mercado Libre, Web y ERP para aplicar. Si un producto tiene precio de ML fijo, ML no cambia.
      </p>
      <DialogFooter>
        <Button variant="outline" onClick={onCerrar} disabled={ocupado === "guardando"}>
          Cancelar
        </Button>
        <Button onClick={guardar} disabled={!vigente || !!ocupado} title={!vigente ? "Primero mirá cómo queda" : undefined}>
          {ocupado === "guardando" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Guardar margen
        </Button>
      </DialogFooter>
    </div>
  );
}
