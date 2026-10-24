"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, BadgeDollarSign, ShoppingBag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { json, pedir, pesos, Seccion } from "@/components/producto/seccion";
import type { Ficha } from "@/app/api/modelos/[id]/ficha/route";

/**
 * Lo que se vende (spec 003, REQ-11): cada combinación con su SKU, qué consume y si está activa.
 * Las desactivadas son historia (una variante borrada, "el modelo solo" de uno con variantes).
 *
 * Cada una muestra sus tres precios de Bodega (docs/sdd/003, spec 004, REQ-6). Se ven acá y se
 * aplican sólo en Precios: una sola pantalla para los precios.
 */
export function SeccionLoQueSeVende({ ficha, onCambio }: { ficha: Ficha; onCambio: () => void }) {
  const [guardando, setGuardando] = useState<string | null>(null);
  const [verHistoria, setVerHistoria] = useState(false);
  const activas = ficha.combinaciones.filter((c) => c.activo);
  const historia = ficha.combinaciones.filter((c) => !c.activo);
  const visibles = verHistoria ? ficha.combinaciones : activas;

  async function alternar(id: string, activo: boolean) {
    setGuardando(id);
    try {
      await pedir(`/api/combinaciones/${id}`, json("PATCH", { activo: !activo }));
      onCambio();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cambiar");
    } finally {
      setGuardando(null);
    }
  }

  return (
    <Seccion
      titulo={`Lo que se vende (${activas.length})`}
      icono={ShoppingBag}
      acciones={
        <>
          {historia.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setVerHistoria(!verHistoria)}>
              {verHistoria ? "Ocultar desactivadas" : `Ver desactivadas (${historia.length})`}
            </Button>
          )}
          {activas.length > 0 && (
            <Link
              href={`/precios?modelo=${ficha.producto.id}`}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 px-2"
            >
              <BadgeDollarSign className="h-3.5 w-3.5" />
              Ver en Precios
            </Link>
          )}
        </>
      }
    >
      {visibles.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nada para vender todavía.</p>
      ) : (
        <div className="space-y-1.5">
          {visibles.map((c) => (
            <div key={c.id} className={`rounded-md bg-muted/40 px-3 py-2 ${c.activo ? "" : "opacity-50"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{c.nombre}</p>
                  <p className="text-xs font-mono text-muted-foreground">{c.sku ?? "sin SKU: falta el del producto"}</p>
                </div>
                <Button size="sm" variant="ghost" className="h-7 text-xs shrink-0" disabled={guardando === c.id} onClick={() => alternar(c.id, c.activo)}>
                  {c.activo ? "Desactivar" : "Activar"}
                </Button>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-muted-foreground">Consume:</span>
                {c.consume.map((x, i) => (
                  <Badge key={i} variant={x.tipo === "insumo" ? "secondary" : "outline"} className="font-normal">
                    {x.tipo === "insumo" ? "+ " : ""}
                    {x.etiqueta}
                    {!x.stockId && x.motivo === "a_pedido" ? " (a pedido)" : ""}
                  </Badge>
                ))}
                {c.pendiente && (
                  <span className="flex items-center gap-1 text-amber-600">
                    <AlertTriangle className="h-3 w-3" /> falta elegir el insumo
                  </span>
                )}
              </div>
              {c.activo && (
                <div className="mt-1 text-xs text-muted-foreground">
                  {c.precios ? (
                    <span className="tabular-nums">
                      ML <span className="text-foreground">{pesos(c.precios.mlPublicado)}</span>
                      {c.precios.mlPublicado !== c.precios.ml && <> (paga {pesos(c.precios.ml)})</>} · Web{" "}
                      <span className="text-foreground">{pesos(c.precios.web)}</span> · Personalizados{" "}
                      <span className="text-foreground">{pesos(c.precios.personalizado)}</span>
                    </span>
                  ) : (
                    <span>Sin precio: {c.faltaCostear}</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Seccion>
  );
}
