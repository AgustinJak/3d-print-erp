"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, Clapperboard, Gamepad2, Gift, Music, Sparkles, Tv } from "lucide-react";
import { json, pedir } from "@/components/producto/seccion";
import { Segmentado } from "@/components/segmentado";
import { diasHasta } from "@/lib/temas";
import type { EventoEnVista } from "@/lib/tendencias-vista";
import { TIPO_DE_EVENTO, fechaLarga } from "./senal";

/**
 * El calendario completo de Tendencias (docs/sdd/016): todo lo que viene en los próximos 6 meses,
 * por mes, con póster y descripción. Los estrenos que no son de ningún tema se pueden sumar a uno,
 * y desde ahí cuentan en la lista.
 */

const ICONO: Record<string, typeof CalendarDays> = {
  pelicula: Clapperboard,
  serie: Tv,
  anime: Sparkles,
  concierto: Music,
  fecha_comercial: Gift,
  gaming: Gamepad2,
};

type Filtro = "todos" | "pelicula" | "serie" | "anime" | "concierto" | "fecha_comercial" | "otros";
const PRINCIPALES = ["pelicula", "serie", "anime", "concierto", "fecha_comercial"];
const FILTROS: Array<[Filtro, string]> = [
  ["todos", "Todo"],
  ["pelicula", "Películas"],
  ["serie", "Series"],
  ["anime", "Anime"],
  ["concierto", "Recitales"],
  ["fecha_comercial", "Fechas comerciales"],
  ["otros", "Otros"],
];

function coincide(e: EventoEnVista, f: Filtro): boolean {
  if (f === "todos") return true;
  if (f === "otros") return !PRINCIPALES.includes(e.tipo);
  return e.tipo === f;
}

export function Calendario({
  eventos,
  temas,
  onAbrirTema,
  onCambio,
}: {
  eventos: EventoEnVista[];
  temas: Array<{ id: string; nombre: string }>;
  onAbrirTema: (id: string) => void;
  onCambio: () => void;
}) {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [soloSinTema, setSoloSinTema] = useState(false);

  const futuros = useMemo(() => eventos.filter((e) => diasHasta(e.fecha) >= 0), [eventos]);
  const cuenta = (f: Filtro) => futuros.filter((e) => coincide(e, f)).length;
  const meses = useMemo(() => {
    const m = new Map<string, EventoEnVista[]>();
    for (const e of futuros) {
      if (!coincide(e, filtro) || (soloSinTema && (e.temaId || e.comercial))) continue;
      const clave = e.fecha.slice(0, 7);
      m.set(clave, [...(m.get(clave) ?? []), e]);
    }
    return [...m.entries()];
  }, [futuros, filtro, soloSinTema]);

  async function sumar(e: EventoEnVista, temaId: string) {
    try {
      await pedir(`/api/tendencias/eventos/${e.id}`, json("PATCH", { temaId }));
      toast.success(`«${e.titulo}» ahora cuenta para ${temas.find((t) => t.id === temaId)?.nombre}`);
      onCambio();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmentado
          chico
          etiqueta="Tipo de fecha"
          valor={filtro}
          onChange={setFiltro}
          opciones={FILTROS.filter(([f]) => f === "todos" || cuenta(f) > 0).map(([f, l]) => [
            f,
            <>
              {l} <span className="font-mono text-muted-foreground tabular-nums">{cuenta(f)}</span>
            </>,
          ])}
        />
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" className="accent-primary" checked={soloSinTema} onChange={(e) => setSoloSinTema(e.target.checked)} /> Sólo los que no son de un tema
        </label>
      </div>

      {!meses.length ? (
        <p className="rounded-xl border p-6 text-sm text-muted-foreground">Nada con ese filtro en los próximos 6 meses.</p>
      ) : (
        meses.map(([mes, lista]) => (
          <section key={mes} className="space-y-2">
            <h3 className="text-sm font-medium first-letter:uppercase">
              {new Date(`${mes}-15T12:00:00Z`).toLocaleDateString("es-AR", { month: "long", year: "numeric" })}{" "}
              <span className="font-mono text-xs font-normal text-muted-foreground tabular-nums">· {lista.length}</span>
            </h3>
            <ul className="divide-y overflow-hidden rounded-xl border bg-card">
              {lista.map((e) => (
                <Fila key={(e.id ?? e.titulo) + e.fecha} e={e} temas={temas} onAbrirTema={onAbrirTema} onSumar={(t) => sumar(e, t)} />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function Fila({
  e,
  temas,
  onAbrirTema,
  onSumar,
}: {
  e: EventoEnVista;
  temas: Array<{ id: string; nombre: string }>;
  onAbrirTema: (id: string) => void;
  onSumar: (temaId: string) => void;
}) {
  const dias = diasHasta(e.fecha);
  const Icono = ICONO[e.tipo] ?? CalendarDays;
  return (
    <li className="flex gap-4 p-4">
      <div className="flex h-24 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
        {e.imagenUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={e.imagenUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <Icono className="h-5 w-5 text-muted-foreground/50" strokeWidth={1.5} />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-mono text-xs text-muted-foreground tabular-nums">{fechaLarga(e.fecha)}</span>
          <span className={`text-xs ${dias <= 21 ? "text-foreground" : "text-muted-foreground"}`}>{dias === 0 ? "hoy" : dias === 1 ? "mañana" : `en ${dias} días`}</span>
        </div>
        <div className="text-sm font-medium">{e.titulo}</div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>{TIPO_DE_EVENTO[e.tipo] ?? e.tipo}</span>
          {!e.enArgentina && <span>· fecha mundial, sin estreno en Argentina cargado</span>}
          {e.temaId && e.temaNombre ? (
            <button type="button" onClick={() => onAbrirTema(e.temaId!)} className="inline-flex h-6 items-center gap-1.5 rounded-md border px-2 text-xs text-foreground transition-colors hover:bg-muted/60">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
              {e.temaNombre}
            </button>
          ) : (
            e.id &&
            !e.comercial && (
              <select defaultValue="" onChange={(x) => x.target.value && onSumar(x.target.value)} className="h-6 max-w-[180px] rounded-md border bg-background px-1.5 text-xs" aria-label="Sumar a un tema">
                <option value="">Sumar a un tema…</option>
                {temas.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            )
          )}
        </div>
        {e.descripcion && <p className="line-clamp-2 text-xs text-muted-foreground">{e.descripcion}</p>}      </div>
    </li>
  );
}
