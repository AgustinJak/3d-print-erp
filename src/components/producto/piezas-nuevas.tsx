"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Box, Plus, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { json, pedir, pesos } from "@/components/producto/seccion";
import type { CandidatoBodega } from "@/lib/altas-bodega";

/** Qué pasaría con cada pieza, en palabras (docs/sdd/004, spec 005). */
function destino(c: CandidatoBodega): { texto: string; aviso?: boolean } {
  switch (c.accion) {
    case "opcion":
      return { texto: c.producto?.id ? `opción "${c.opcion?.nombre}" de "${c.producto.nombre}"` : `producto nuevo "${c.producto?.nombre}" con la opción "${c.opcion?.nombre}"` };
    case "insumo":
      return { texto: "insumo (categoría Insumos de Bodega)" };
    case "enlazar":
      return { texto: `se engancha a "${c.modeloExistenteNombre}", que ya existe` };
    case "conflicto":
      return { texto: c.motivo ?? "no se puede ubicar solo", aviso: true };
    default:
      return { texto: "producto nuevo" };
  }
}

/**
 * Piezas nuevas (spec 005, REQ-6): las piezas de Bodega que no entraron solas al ERP —las que ya
 * estaban antes del alta automática y las que tienen un conflicto— con lo que pasaría con cada
 * una. Hasta la 004 vivía en Integraciones › Costos.
 */
export function PiezasNuevas({ onCambio }: { onCambio: () => void }) {
  const [piezas, setPiezas] = useState<CandidatoBodega[] | null>(null);
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const [abierto, setAbierto] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vigente = true;
    // Bodega es de un solo negocio: para la cuenta demo responde error y no se muestra nada.
    pedir<{ nuevos: CandidatoBodega[]; sinTraer: CandidatoBodega[] }>("/api/bodega/altas")
      .then((r) => vigente && setPiezas([...r.nuevos, ...r.sinTraer]))
      .catch(() => vigente && setPiezas([]));
    return () => {
      vigente = false;
    };
  }, [version]);

  if (!piezas || piezas.length === 0) return null;

  async function hacer(accion: "crear" | "ignorar") {
    setOcupado(true);
    try {
      const r = await pedir<{ creados?: unknown[]; mapeados?: unknown[]; omitidos?: Array<{ nombre: string; motivo: string }> }>(
        "/api/bodega/altas",
        json("POST", { accion, ids: [...elegidas] })
      );
      if (accion === "ignorar") toast.success(`${elegidas.size} descartadas: no vuelven a aparecer`);
      else {
        const hechas = (r.creados?.length ?? 0) + (r.mapeados?.length ?? 0);
        toast.success(`${hechas} traídas al inventario${r.omitidos?.length ? ` · ${r.omitidos.length} no se pudieron` : ""}`);
        for (const o of r.omitidos ?? []) toast.error(`${o.nombre}: ${o.motivo}`);
      }
      setElegidas(new Set());
      setVersion((v) => v + 1);
      onCambio();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Card className="overflow-hidden border-sky-500/30">
      <button type="button" onClick={() => setAbierto(!abierto)} className="w-full p-3 text-left flex items-center justify-between gap-2 hover:bg-muted/30">
        <span className="font-medium flex items-center gap-2 text-sm">
          <Box className="h-4 w-4" /> {piezas.length} piezas de Bodega que no están en el inventario
        </span>
        <span className="text-xs text-muted-foreground">{abierto ? "Ocultar" : "Ver"}</span>
      </button>
      {abierto && (
        <>
          <p className="px-3 pb-2 text-xs text-muted-foreground max-w-3xl">
            Lo nuevo de Bodega entra solo. Estas son las que ya estaban antes o no se pudieron ubicar: traé las que sean
            productos de verdad y descartá las pruebas. Lo descartado no vuelve a aparecer.
          </p>
          <ul className="divide-y border-t">
            {piezas.map((c) => {
              const d = destino(c);
              // Una trabada no se puede traer (lo frena el servidor), pero sí descartar.
              const trabada = c.accion === "conflicto";
              return (
                <li key={c.bodegaModelId} className="px-3 py-2">
                  <label className={`flex items-start gap-3 cursor-pointer ${trabada ? "opacity-70" : ""}`}>
                    <input
                      type="checkbox"
                      className="h-4 w-4 mt-0.5 accent-sky-500 shrink-0"
                      checked={elegidas.has(c.bodegaModelId)}
                      onChange={() =>
                        setElegidas((prev) => {
                          const s = new Set(prev);
                          if (s.has(c.bodegaModelId)) s.delete(c.bodegaModelId);
                          else s.add(c.bodegaModelId);
                          return s;
                        })
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-2">
                        <span className="font-medium text-sm">{c.nombre}</span>
                        {c.categoria && (
                          <Badge variant="secondary" className="h-5 px-1.5 text-[11px]">
                            {c.categoria}
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {c.tieneReceta ? pesos(c.costoFab + c.costoInsumos) : "sin costear en Bodega"}
                        </span>
                      </span>
                      <span className={`block text-xs ${d.aviso ? "text-amber-600" : "text-sky-600"}`}>→ {d.texto}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="p-3 border-t flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={ocupado || elegidas.size === 0} onClick={() => hacer("crear")}>
              <Plus className="mr-1.5 h-4 w-4" /> Traer ({elegidas.size})
            </Button>
            <Button size="sm" variant="outline" disabled={ocupado || elegidas.size === 0} onClick={() => hacer("ignorar")}>
              <XCircle className="mr-1.5 h-4 w-4" /> Descartar ({elegidas.size})
            </Button>
            <button
              type="button"
              className="text-xs text-muted-foreground underline underline-offset-2"
              onClick={() => setElegidas(elegidas.size === piezas.length ? new Set() : new Set(piezas.map((c) => c.bodegaModelId)))}
            >
              {elegidas.size === piezas.length ? "no elegir ninguna" : "elegir todas"}
            </button>
          </div>
        </>
      )}
    </Card>
  );
}
