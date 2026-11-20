"use client";

import { useState } from "react";
import { ExternalLink, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { STLModel } from "@/lib/stl-search";

const FUENTE: Record<STLModel["source"], string> = {
  printables: "Printables",
  thingiverse: "Thingiverse",
  myminifactory: "MyMiniFactory",
  cults3d: "Cults3D",
};

/** Modelos para imprimir de un tema: Printables, Thingiverse, Cults y MyMiniFactory. Busca al pedirlo. */
export function BuscarModelos({ inicial }: { inicial: string }) {
  const [q, setQ] = useState(inicial);
  const [resultados, setResultados] = useState<STLModel[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buscar() {
    const t = q.trim();
    if (t.length < 2) return;
    setBuscando(true);
    setError(null);
    try {
      const r = await fetch(`/api/tendencias/stl-search?q=${encodeURIComponent(t)}&limit=9`);
      if (!r.ok) throw new Error(`error ${r.status}`);
      setResultados((await r.json()) as STLModel[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBuscando(false);
    }
  }

  return (
    <div className="space-y-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          buscar();
        }}
      >
        <Input value={q} onChange={(e) => setQ(e.target.value)} className="h-8" aria-label="Buscar modelos" />
        <Button type="submit" size="sm" variant="outline" disabled={buscando || q.trim().length < 2}>
          {buscando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" strokeWidth={1.5} />}
          Buscar
        </Button>
      </form>
      {error && <p className="text-xs text-amber-600 dark:text-amber-400">No se pudo buscar: {error}</p>}
      {resultados && !resultados.length && <p className="text-xs text-muted-foreground">Nada con «{q}». Probá con el nombre en inglés o un personaje.</p>}
      {resultados && resultados.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {resultados.map((m) => (
            <a
              key={`${m.source}-${m.id}`}
              href={m.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group overflow-hidden rounded-lg border transition-colors hover:border-foreground/20"
            >
              <div className="aspect-[4/3] bg-muted">
                {m.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")} />
                )}
              </div>
              <div className="space-y-0.5 p-2">
                <p className="line-clamp-2 text-xs leading-snug">{m.name}</p>
                <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  {FUENTE[m.source]}
                  {m.likes ? <span className="font-mono tabular-nums">· {m.likes}</span> : null}
                  <ExternalLink className="ml-auto h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" strokeWidth={1.5} />
                </p>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
