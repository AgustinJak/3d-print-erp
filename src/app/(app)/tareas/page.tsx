"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Segmentado } from "@/components/segmentado";
import { pedirJson, type Persona } from "@/components/tareas/comun";
import { TableroDeTareas } from "@/components/tareas/tablero";
import { EditorDeTarea } from "@/components/tareas/editor";
import { HistorialDeTareas } from "@/components/tareas/historial";
import { TareasQueSeRepiten } from "@/components/tareas/recurrentes";
import type { TareaVista } from "@/lib/tareas";

/**
 * Tareas (docs/sdd/012): el tablero del día, lo terminado día por día y las que se repiten.
 * Terminadas se vacía sola al otro día: cada tarea guarda cuándo se terminó.
 */

type Vista = "tablero" | "historial" | "repiten";

export default function TareasPage() {
  const [vista, setVista] = useState<Vista>("tablero");
  const [tareas, setTareas] = useState<TareaVista[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState("todas");
  const [abierta, setAbierta] = useState<TareaVista | null>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await pedirJson<{ tareas: TareaVista[]; personas: Persona[] }>("/api/tareas");
      setTareas(r.tareas);
      setPersonas(r.personas);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudieron leer las tareas");
    } finally {
      setCargando(false);
    }
  }, []);
  useEffect(() => {
    cargar();
  }, [cargar]);

  // Al volver a la pestaña (por ejemplo, al otro día) se relee: Terminadas arranca vacía.
  useEffect(() => {
    const alVolver = () => document.visibilityState === "visible" && vista === "tablero" && cargar();
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, [cargar, vista]);

  const terminadasHoy = tareas.filter((t) => t.estado === "terminada").length;
  const abiertas = tareas.length - terminadasHoy;

  return (
    <motion.div className="mx-auto max-w-[1440px] space-y-6" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] leading-[1.15] font-medium">Tareas</h1>
          <p className="text-sm text-muted-foreground">
            {cargando ? "El tablero del día" : `${abiertas} ${abiertas === 1 ? "abierta" : "abiertas"} · ${terminadasHoy} ${terminadasHoy === 1 ? "terminada" : "terminadas"} hoy`}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Segmentado
          etiqueta="Qué mirar"
          valor={vista}
          onChange={setVista}
          opciones={[
            ["tablero", "Hoy"],
            ["historial", "Historial"],
            ["repiten", "Se repiten"],
          ]}
        />
        {vista !== "repiten" && personas.length > 1 && (
          <Segmentado
            chico
            etiqueta="De quién"
            valor={filtro}
            onChange={setFiltro}
            opciones={[["todas", "Todos"], ...personas.map((p) => [p.id, p.nombre.split(" ")[0]] as const), ["sin", "Sin asignar"]]}
          />
        )}
      </div>

      {vista === "tablero" &&
        (cargando ? (
          <div className="grid grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-80 rounded-xl" />
            ))}
          </div>
        ) : (
          <TableroDeTareas tareas={tareas} setTareas={setTareas} personas={personas} filtro={filtro} onAbrir={setAbierta} />
        ))}
      {vista === "historial" && (
        <HistorialDeTareas
          filtro={filtro}
          onAbrir={(t, ps) => {
            if (!personas.length) setPersonas(ps);
            setAbierta(t);
          }}
        />
      )}
      {vista === "repiten" && <TareasQueSeRepiten personas={personas} />}

      <EditorDeTarea
        tarea={abierta}
        personas={personas}
        onCerrar={() => setAbierta(null)}
        onGuardada={(t) => setTareas((ts) => (ts.some((x) => x.id === t.id) ? ts.map((x) => (x.id === t.id ? t : x)) : ts))}
        onBorrada={(id) => setTareas((ts) => ts.filter((x) => x.id !== id))}
      />
    </motion.div>
  );
}
