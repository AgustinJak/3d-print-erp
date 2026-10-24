"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, DollarSign } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dato, json, pedir, pesos, Seccion } from "@/components/producto/seccion";
import type { Ficha } from "@/app/api/modelos/[id]/ficha/route";

interface Valores {
  precioVenta: string;
  precioCreditoPorc: string;
  precioMayorista: string;
  precioPromo: string;
  costoFab: string;
  costoInsumos: string;
}

const txt = (n: number | null) => (n == null ? "" : String(n));
const desde = (p: Ficha["producto"]): Valores => ({
  precioVenta: txt(p.precioVenta),
  precioCreditoPorc: txt(p.precioCreditoPorc),
  precioMayorista: txt(p.precioMayorista),
  precioPromo: txt(p.precioPromo),
  costoFab: txt(p.costoFab),
  costoInsumos: txt(p.costoInsumos),
});

/** Margen sobre el costo completo: fabricación + insumos (spec 002, RN-1). */
export function margenDe(p: Pick<Ficha["producto"], "precioVenta" | "costoFab" | "costoInsumos">): number | null {
  if (!p.precioVenta) return null;
  return Math.round(((p.precioVenta - p.costoFab - p.costoInsumos) / p.precioVenta) * 100);
}

/**
 * Precio y costo (spec 002, REQ-2 y REQ-7). Si alguna pieza del producto está costeada en
 * Bodega, el costo lo pone el ERP solo (spec 007) y acá sólo se mira.
 */
export function SeccionPrecioCosto({ ficha, onCambio }: { ficha: Ficha; onCambio: () => void }) {
  const p = ficha.producto;
  const deBodega = ficha.costo.deBodega;
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [v, setV] = useState<Valores>(() => desde(p));

  const sucio = editando && JSON.stringify(v) !== JSON.stringify(desde(p));
  const cambiar = (k: keyof Valores, x: string) => setV((prev) => ({ ...prev, [k]: x }));
  const margen = margenDe(p);

  async function guardar() {
    setGuardando(true);
    try {
      const body: Record<string, string | null> = {
        precioVenta: v.precioVenta,
        precioCreditoPorc: v.precioCreditoPorc,
        precioMayorista: v.precioMayorista || null,
        precioPromo: v.precioPromo || null,
      };
      if (!deBodega) Object.assign(body, { costoFab: v.costoFab, costoInsumos: v.costoInsumos });
      await pedir(`/api/modelos/${p.id}`, json("PATCH", body));
      toast.success("Precio guardado");
      setEditando(false);
      onCambio();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  const campo = (k: keyof Valores, etiqueta: string, ayuda?: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`pc-${k}`}>
        {etiqueta} {ayuda && <span className="text-xs text-muted-foreground font-normal">{ayuda}</span>}
      </Label>
      <Input id={`pc-${k}`} inputMode="decimal" value={v[k]} onChange={(e) => cambiar(k, e.target.value)} />
    </div>
  );

  return (
    <Seccion
      titulo="Precio y costo"
      icono={DollarSign}
      editando={editando}
      sucio={sucio}
      guardando={guardando}
      onEditar={() => {
        setV(desde(p));
        setEditando(true);
      }}
      onCancelar={() => setEditando(false)}
      onGuardar={guardar}
    >
      {editando ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {campo("precioVenta", "Precio de venta")}
            {campo("precioCreditoPorc", "Recargo crédito", "(%)")}
            {campo("precioMayorista", "Mayorista")}
            {campo("precioPromo", "Promo")}
          </div>
          {deBodega ? (
            <p className="text-xs text-muted-foreground">El costo sale de Bodega: se cambia costeando la pieza allá.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {campo("costoFab", "Costo de fabricación")}
              {campo("costoInsumos", "Costo de insumos", "(cadena, imanes…)")}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">Precio de venta</span>
            <span className="text-xl font-bold">{pesos(p.precioVenta)}</span>
          </div>
          <div className="divide-y">
            <Dato etiqueta={`Crédito (+${p.precioCreditoPorc}%)`}>{pesos(p.precioVenta * (1 + p.precioCreditoPorc / 100))}</Dato>
            {p.precioMayorista != null && <Dato etiqueta="Mayorista">{pesos(p.precioMayorista)}</Dato>}
            {p.precioPromo != null && <Dato etiqueta="Promo">{pesos(p.precioPromo)}</Dato>}
            <Dato etiqueta="Costo">
              <span className="flex items-center justify-end gap-2">
                {pesos(p.costoFab + p.costoInsumos)}
                <Badge variant="outline" className="font-normal">
                  {deBodega ? "de Bodega" : "a mano"}
                </Badge>
              </span>
            </Dato>
            <Dato etiqueta="Margen">
              {margen == null ? "—" : <Badge variant={margen >= 40 ? "default" : "secondary"}>{margen}%</Badge>}
            </Dato>
          </div>
          {ficha.costo.faltan.length > 0 && (
            <p className="flex items-start gap-1.5 text-xs text-amber-600">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>Falta costear en Bodega: {ficha.costo.faltan.join(", ")}.</span>
            </p>
          )}
        </div>
      )}
    </Seccion>
  );
}
