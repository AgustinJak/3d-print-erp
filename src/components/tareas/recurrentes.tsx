"use client";

import { useCallback, useEffect, useState } from "react";
import { Pause, Play, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmentado } from "@/components/segmentado";
import { Avatar, conJson, pedirJson, type Persona } from "@/components/tareas/comun";
import { textoDeFrecuencia, type Frecuencia } from "@/lib/tareas-reglas";

/**
 * Las tareas que se repiten (docs/sdd/012): cada una crea su tarea en Por hacer el día que toca,
 * cuando se abre el tablero. Se pueden pausar sin perderlas.
 */

interface Recurrente {
  id: string;
  titulo: string;
  nota: string | null;
  frecuencia: Frecuencia;
  dias: number[];
  responsableId: string | null;
  prioridad: string;
  activa: boolean;
}

const SEMANA: Array<[number, string]> = [
  [1, "L"],
  [2, "M"],
  [3, "M"],
  [4, "J"],
  [5, "V"],
  [6, "S"],
  [0, "D"],
];

export function TareasQueSeRepiten({ personas }: { personas: Persona[] }) {
  const [lista, setLista] = useState<Recurrente[] | null>(null);
  const [titulo, setTitulo] = useState("");
  const [frecuencia, setFrecuencia] = useState<Frecuencia>("diaria");
  const [dias, setDias] = useState<number[]>([1]);
  const [diaDelMes, setDiaDelMes] = useState("8");
  const [responsableId, setResponsableId] = useState("");

  const cargar = useCallback(async () => {
    setLista((await pedirJson<{ recurrentes: Recurrente[] }>("/api/tareas/recurrentes").catch(() => ({ recurrentes: [] }))).recurrentes);
  }, []);
  useEffect(() => {
    // Se lee al abrir; después, después de cada cambio.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
  }, [cargar]);

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim()) return;
    const ds = frecuencia === "semanal" ? dias : frecuencia === "mensual" ? diaDelMes.split(",").map((x) => Number(x.trim())).filter((n) => n >= 1 && n <= 31) : [];
    if (frecuencia !== "diaria" && !ds.length) return toast.error("Elegí al menos un día");
    try {
      await pedirJson("/api/tareas/recurrentes", conJson("POST", { titulo, frecuencia, dias: ds, responsableId: responsableId || null }));
      setTitulo("");
      toast.success("Listo: aparece en Por hacer el día que toca");
      cargar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo crear");
    }
  };

  const cambiar = async (id: string, c: Partial<Recurrente>) => {
    await pedirJson(`/api/tareas/recurrentes/${id}`, conJson("PATCH", c)).catch(() => toast.error("No se pudo guardar"));
    cargar();
  };
  const borrar = async (id: string) => {
    await pedirJson(`/api/tareas/recurrentes/${id}`, { method: "DELETE" }).catch(() => toast.error("No se pudo borrar"));
    cargar();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <form onSubmit={crear} className="space-y-4 rounded-xl border bg-card p-5">
        <h3 className="font-medium">Nueva tarea que se repite</h3>
        <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Revisar la facturación de ML" />
        <Segmentado
          etiqueta="Frecuencia"
          valor={frecuencia}
          onChange={setFrecuencia}
          opciones={[
            ["diaria", "Todos los días"],
            ["semanal", "Algunos días"],
            ["mensual", "Una vez al mes"],
          ]}
        />
        {frecuencia === "semanal" && (
          <div className="flex gap-1">
            {SEMANA.map(([d, l]) => (
              <button
                key={d}
                type="button"
                onClick={() => setDias((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]))}
                className={`h-8 w-8 rounded-lg text-sm transition-colors duration-150 ${dias.includes(d) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
                aria-pressed={dias.includes(d)}
              >
                {l}
              </button>
            ))}
          </div>
        )}
        {frecuencia === "mensual" && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            El día
            <Input value={diaDelMes} onChange={(e) => setDiaDelMes(e.target.value)} className="h-8 w-24" inputMode="numeric" />
            de cada mes
          </label>
        )}
        <select value={responsableId} onChange={(e) => setResponsableId(e.target.value)} className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm">
          <option value="">Sin asignar</option>
          {personas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
        <Button type="submit" className="w-full">
          <Plus className="h-4 w-4" strokeWidth={1.5} /> Agregar
        </Button>
      </form>

      <section className="space-y-2">
        {!lista ? null : lista.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Todavía no hay tareas que se repitan</p>
        ) : (
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {lista.map((r) => (
              <li key={r.id} className={`flex items-center gap-3 px-4 py-3 ${r.activa ? "" : "opacity-60"}`}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.titulo}</p>
                  <p className="text-xs text-muted-foreground">
                    {textoDeFrecuencia(r)}
                    {!r.activa && " · pausada"}
                  </p>
                </div>
                <Avatar persona={personas.find((p) => p.id === r.responsableId)} chico />
                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" onClick={() => cambiar(r.id, { activa: !r.activa })} title={r.activa ? "Pausar" : "Reanudar"} aria-label={r.activa ? "Pausar" : "Reanudar"}>
                  {r.activa ? <Pause className="h-4 w-4" strokeWidth={1.5} /> : <Play className="h-4 w-4" strokeWidth={1.5} />}
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-red-600" onClick={() => borrar(r.id)} title="Borrar" aria-label="Borrar">
                  <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
