"use client";

import { useCallback, useEffect, useState } from "react";
import { Paperclip, Repeat } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, pedirJson, type Persona } from "@/components/tareas/comun";
import { diaDe } from "@/lib/tareas-reglas";
import type { TareaVista } from "@/lib/tareas";

/** Lo que se terminó, día por día (docs/sdd/012). Por defecto, los últimos 30 días. */
export function HistorialDeTareas({ filtro, onAbrir }: { filtro: string; onAbrir: (t: TareaVista, personas: Persona[]) => void }) {
  // Hoy y ayer se fijan al abrir la pantalla.
  const [{ hoy, ayer, haceUnMes }] = useState(() => {
    const ahora = Date.now();
    return { hoy: diaDe(new Date(ahora)), ayer: diaDe(new Date(ahora - 864e5)), haceUnMes: diaDe(new Date(ahora - 30 * 864e5)) };
  });
  const [hasta, setHasta] = useState(hoy);
  const [desde, setDesde] = useState(haceUnMes);
  const [datos, setDatos] = useState<{ dias: Array<{ dia: string; tareas: TareaVista[] }>; personas: Persona[] } | null>(null);

  const cargar = useCallback(async () => {
    setDatos(null);
    setDatos(await pedirJson<{ dias: Array<{ dia: string; tareas: TareaVista[] }>; personas: Persona[] }>(`/api/tareas?vista=historial&desde=${desde}&hasta=${hasta}`).catch(() => ({ dias: [], personas: [] })));
  }, [desde, hasta]);
  useEffect(() => {
    // Se relee al cambiar las fechas.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
  }, [cargar]);

  const titulo = (d: string) => {
    if (d === hoy) return "Hoy";
    if (d === ayer) return "Ayer";
    const t = new Date(`${d}T12:00:00`).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
    return t.charAt(0).toUpperCase() + t.slice(1);
  };
  const dias = (datos?.dias ?? [])
    .map((d) => ({ ...d, tareas: d.tareas.filter((t) => filtro === "todas" || (filtro === "sin" ? !t.responsableId : t.responsableId === filtro)) }))
    .filter((d) => d.tareas.length);
  const total = dias.reduce((s, d) => s + d.tareas.length, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2 text-muted-foreground">
          Desde <Input type="date" value={desde} max={hasta} onChange={(e) => e.target.value && setDesde(e.target.value)} className="h-8 w-40" />
        </label>
        <label className="flex items-center gap-2 text-muted-foreground">
          hasta <Input type="date" value={hasta} min={desde} max={hoy} onChange={(e) => e.target.value && setHasta(e.target.value)} className="h-8 w-40" />
        </label>
        {datos && (
          <span className="text-muted-foreground">
            {total} {total === 1 ? "tarea terminada" : "tareas terminadas"} en {dias.length} {dias.length === 1 ? "día" : "días"}
          </span>
        )}
      </div>

      {!datos ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : dias.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">No hay tareas terminadas en esas fechas</p>
      ) : (
        <ol className="space-y-6">
          {dias.map((d) => (
            <li key={d.dia}>
              <h3 className="mb-2 flex items-baseline gap-2 text-sm font-medium">
                {titulo(d.dia)} <span className="font-mono text-xs text-muted-foreground">{d.tareas.length}</span>
              </h3>
              <ul className="divide-y overflow-hidden rounded-xl border bg-card">
                {d.tareas.map((t) => (
                  <li key={t.id}>
                    <button type="button" onClick={() => onAbrir(t, datos.personas)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/50">
                      <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">{t.terminadaEn ? new Date(t.terminadaEn).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) : ""}</span>
                      <span className="flex-1 truncate text-sm">{t.titulo}</span>
                      {t.recurrenteId && <Repeat className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />}
                      {t.archivos.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Paperclip className="h-3 w-3" strokeWidth={1.5} /> {t.archivos.length}
                        </span>
                      )}
                      <Avatar persona={datos.personas.find((p) => p.id === t.responsableId)} chico />
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
