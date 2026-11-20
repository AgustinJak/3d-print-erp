"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { json, pedir } from "@/components/producto/seccion";
import type { BusquedaNueva } from "@/lib/tendencias-vista";

/**
 * Búsquedas que suben en ML y no coinciden con ningún tema (docs/sdd/016, flujo 3.3). Primero las
 * de las categorías donde vendés, después las generales. Cada una se vuelve tema, se suma como
 * alias de uno que ya existe, o se descarta y no vuelve.
 */

const GRUPOS: Array<{ ambito: BusquedaNueva["ambito"]; titulo: string }> = [
  { ambito: "tuya", titulo: "En tus categorías" },
  { ambito: "raiz", titulo: "En las categorías generales" },
  { ambito: "sitio", titulo: "En todo Mercado Libre" },
];
const POR_GRUPO = 8;

export function BusquedasNuevas({
  nuevas,
  temas,
  onCrear,
  onCambio,
}: {
  nuevas: BusquedaNueva[];
  temas: Array<{ id: string; nombre: string }>;
  onCrear: (palabra: string) => void;
  onCambio: () => void;
}) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const [todas, setTodas] = useState<Set<string>>(new Set());
  const [ocultas, setOcultas] = useState<Set<string>>(new Set());

  async function descartar(b: BusquedaNueva) {
    setOcultas((s) => new Set(s).add(b.normalizada));
    try {
      await pedir("/api/tendencias/busquedas", json("POST", { palabra: b.palabra, accion: "descartar" }));
      toast(`«${b.palabra}» no vuelve a aparecer`, {
        action: {
          label: "Deshacer",
          onClick: () =>
            pedir("/api/tendencias/busquedas", json("POST", { palabra: b.palabra, accion: "volver" })).then(() =>
              setOcultas((s) => {
                const n = new Set(s);
                n.delete(b.normalizada);
                return n;
              })
            ),
        },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      setOcultas((s) => {
        const n = new Set(s);
        n.delete(b.normalizada);
        return n;
      });
    }
  }

  async function sumar(b: BusquedaNueva, temaId: string) {
    const tema = temas.find((t) => t.id === temaId)?.nombre;
    try {
      await pedir(`/api/tendencias/temas/${temaId}`, json("PATCH", { sumarAlias: b.palabra }));
      toast.success(`«${b.palabra}» ahora suma a ${tema}`);
      setAbierta(null);
      onCambio();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  const visibles = nuevas.filter((b) => !ocultas.has(b.normalizada));
  if (!visibles.length)
    return <p className="text-sm text-muted-foreground">Nada nuevo: todo lo que sube en tus categorías ya es de un tema o lo descartaste.</p>;

  return (
    <div className="space-y-5">
      {GRUPOS.map((g) => {
        const lista = visibles.filter((b) => b.ambito === g.ambito);
        if (!lista.length) return null;
        const mostrar = todas.has(g.ambito) ? lista : lista.slice(0, POR_GRUPO);
        return (
          <div key={g.ambito} className="space-y-1.5">
            <p className="text-xs text-muted-foreground">
              {g.titulo} <span className="font-mono tabular-nums">· {lista.length}</span>
            </p>
            <ul className="-mx-2">
              {mostrar.map((b) => {
                const clave = `${b.categoriaId}-${b.normalizada}`;
                const open = abierta === clave;
                return (
                  <li key={clave} className={`rounded-lg ${open ? "bg-muted/60" : ""}`}>
                    <button
                      type="button"
                      onClick={() => setAbierta(open ? null : clave)}
                      aria-expanded={open}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/60"
                    >
                      {b.nueva ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" title="Nueva esta semana" /> : <span className="w-1.5 shrink-0" />}
                      <span className="min-w-0 flex-1 truncate">{b.palabra}</span>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">#{b.posicion}</span>
                    </button>
                    {open && (
                      <div className="space-y-2 px-2 pt-0.5 pb-2.5">
                        <p className="pl-3.5 text-xs text-muted-foreground">{b.categoriaId === "MLA" ? "todo Mercado Libre" : b.categoria}</p>
                        <div className="flex flex-wrap items-center gap-1.5 pl-3.5">
                          <Button size="xs" onClick={() => onCrear(b.palabra)}>
                            <Plus className="h-3 w-3" strokeWidth={1.5} /> Crear tema
                          </Button>
                          <select
                            defaultValue=""
                            onChange={(e) => e.target.value && sumar(b, e.target.value)}
                            className="h-6 max-w-[160px] rounded-md border bg-background px-1.5 text-xs"
                            aria-label="Sumar a un tema"
                          >
                            <option value="">Sumar a…</option>
                            {temas.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.nombre}
                              </option>
                            ))}
                          </select>
                          <Button size="xs" variant="ghost" className="text-muted-foreground" onClick={() => descartar(b)}>
                            <X className="h-3 w-3" /> Descartar
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {lista.length > POR_GRUPO && (
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() =>
                  setTodas((s) => {
                    const n = new Set(s);
                    if (n.has(g.ambito)) n.delete(g.ambito);
                    else n.add(g.ambito);
                    return n;
                  })
                }
              >
                {todas.has(g.ambito) ? "Ver menos" : `Ver las ${lista.length}`}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
