"use client";

import { useRef, useState } from "react";
import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd";
import { CalendarDays, CheckSquare, Paperclip, Plus, Repeat } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, COLUMNAS, conJson, pedirJson, type Persona } from "@/components/tareas/comun";
import { diaDe, diasAbierta, ordenEntre } from "@/lib/tareas-reglas";
import type { TareaVista } from "@/lib/tareas";

/**
 * El tablero del día (docs/sdd/012): Por hacer, Haciendo, Trabadas y Terminadas hoy. Arrastrar
 * mueve y ordena en el acto y guarda atrás; pasar a Trabadas pide el motivo. Las tareas nuevas se
 * crean con el botón "Nueva tarea" o el + de cada columna, que abren el editor (Agustín, 2026-11-16).
 */

function Tarjeta({ t, personas, hoy, arrastrando, onAbrir }: { t: TareaVista; personas: Persona[]; hoy: string; arrastrando: boolean; onAbrir: () => void }) {
  const hechos = t.pasos.filter((p) => p.hecho).length;
  const abierta = t.estado !== "terminada" ? diasAbierta(t.creadaEn, hoy) : 0;
  const vencida = t.fechaLimite && t.estado !== "terminada" && t.fechaLimite < hoy;
  const vence = t.fechaLimite && t.estado !== "terminada" && t.fechaLimite === hoy;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onAbrir}
      onKeyDown={(e) => e.key === "Enter" && onAbrir()}
      className={`rounded-xl border bg-card p-3 text-left transition-[border-color,box-shadow] duration-150 hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${arrastrando ? "shadow-[0_8px_24px_rgba(0,0,0,0.12)]" : ""}`}
    >
      <div className="flex items-start gap-2">
        {t.prioridad === "alta" && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-500" title="Prioridad alta" />}
        <p className={`flex-1 text-sm leading-5 ${t.estado === "terminada" ? "text-muted-foreground line-through decoration-muted-foreground/50" : "font-medium"}`}>{t.titulo}</p>
        <Avatar persona={personas.find((p) => p.id === t.responsableId)} chico />
      </div>
      {t.estado === "trabada" && t.motivoTrabada && <p className="mt-1.5 text-[13px] leading-[18px] text-amber-700 dark:text-amber-400">{t.motivoTrabada}</p>}
      {(t.pasos.length > 0 || t.archivos.length > 0 || t.fechaLimite || t.recurrenteId || abierta >= 2 || t.terminadaEn) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {t.pasos.length > 0 && (
            <span className={`inline-flex items-center gap-1 font-mono ${hechos === t.pasos.length ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
              <CheckSquare className="h-3 w-3" strokeWidth={1.5} /> {hechos}/{t.pasos.length}
            </span>
          )}
          {t.archivos.length > 0 && (
            <span className="inline-flex items-center gap-1" title={t.archivos.map((a) => a.nombre).join(", ")}>
              <Paperclip className="h-3 w-3" strokeWidth={1.5} /> {t.archivos.length}
            </span>
          )}
          {t.fechaLimite && t.estado !== "terminada" && (
            <span className={`inline-flex items-center gap-1 font-mono ${vencida ? "text-red-600 dark:text-red-400" : vence ? "text-foreground" : ""}`}>
              <CalendarDays className="h-3 w-3" strokeWidth={1.5} />
              {vence ? "Hoy" : new Date(`${t.fechaLimite}T12:00:00`).toLocaleDateString("es-AR", { day: "numeric", month: "short" })}
            </span>
          )}
          {t.recurrenteId && <Repeat className="h-3 w-3" strokeWidth={1.5} aria-label="Se repite" />}
          {abierta >= 2 && <span>desde hace {abierta} días</span>}
          {t.terminadaEn && <span className="font-mono">{new Date(t.terminadaEn).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</span>}
        </div>
      )}
    </div>
  );
}

export function TableroDeTareas({
  tareas,
  setTareas,
  personas,
  filtro,
  onAbrir,
  onNueva,
}: {
  tareas: TareaVista[];
  setTareas: React.Dispatch<React.SetStateAction<TareaVista[]>>;
  personas: Persona[];
  /** "todas", "sin" o el id de una persona. */
  filtro: string;
  onAbrir: (t: TareaVista) => void;
  /** Abre el editor para crear una tarea en esa columna. */
  onNueva: (estado: TareaVista["estado"]) => void;
}) {
  const hoy = diaDe(new Date());
  const [trabando, setTrabando] = useState<{ id: string; motivo: string } | null>(null);
  const guardando = useRef(0);

  const visibles = tareas.filter((t) => filtro === "todas" || (filtro === "sin" ? !t.responsableId : t.responsableId === filtro));
  const deColumna = (estado: string) => visibles.filter((t) => t.estado === estado).sort((a, b) => (estado === "terminada" ? (b.terminadaEn ?? "").localeCompare(a.terminadaEn ?? "") : a.orden - b.orden));

  const cambiar = async (id: string, cambio: Partial<TareaVista>) => {
    const antes = tareas.find((t) => t.id === id);
    if (!antes) return;
    // En el acto en la pantalla; si falla, vuelve.
    setTareas((ts) => ts.map((t) => (t.id === id ? { ...t, ...cambio, ...(cambio.estado === "terminada" && antes.estado !== "terminada" ? { terminadaEn: new Date().toISOString() } : {}), ...(cambio.estado && cambio.estado !== "terminada" ? { terminadaEn: null } : {}) } : t)));
    guardando.current++;
    try {
      const t = await pedirJson<TareaVista>(`/api/tareas/${id}`, conJson("PATCH", cambio));
      setTareas((ts) => ts.map((x) => (x.id === id ? t : x)));
    } catch (e) {
      setTareas((ts) => ts.map((x) => (x.id === id ? antes : x)));
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      guardando.current--;
    }
  };

  const alSoltar = (r: DropResult) => {
    if (!r.destination) return;
    const estado = r.destination.droppableId as TareaVista["estado"];
    const destino = deColumna(estado).filter((t) => t.id !== r.draggableId);
    const i = r.destination.index;
    const orden = ordenEntre(destino[i - 1]?.orden ?? null, destino[i]?.orden ?? null);
    const t = tareas.find((x) => x.id === r.draggableId);
    if (!t) return;
    if (t.estado === estado && r.source.index === i) return;
    cambiar(t.id, { estado, orden });
    if (estado === "trabada" && t.estado !== "trabada") setTrabando({ id: t.id, motivo: "" });
  };

  return (
    <>
      <DragDropContext onDragEnd={alSoltar}>
        <div className="-mx-4 overflow-x-auto px-4 pb-2 md:-mx-8 md:px-8">
          <div className="grid min-w-[1040px] grid-cols-4 gap-4">
            {COLUMNAS.map((col) => {
              const lista = deColumna(col.estado);
              return (
                <section key={col.estado} className="flex flex-col rounded-xl bg-muted/50 p-2">
                  <header className="flex h-9 items-center justify-between pr-1 pl-2">
                    <h2 className="text-sm font-medium">
                      {col.titulo} <span className="ml-1 font-mono text-xs text-muted-foreground">{lista.length}</span>
                    </h2>
                    {col.estado !== "terminada" && (
                      <button
                        type="button"
                        onClick={() => onNueva(col.estado)}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-background hover:text-foreground"
                        title={`Nueva tarea en ${col.titulo}`}
                        aria-label={`Nueva tarea en ${col.titulo}`}
                      >
                        <Plus className="h-4 w-4" strokeWidth={1.5} />
                      </button>
                    )}
                  </header>
                  <Droppable droppableId={col.estado}>
                    {(drop, estado) => (
                      <div ref={drop.innerRef} {...drop.droppableProps} className={`flex min-h-32 flex-1 flex-col gap-2 rounded-lg transition-colors duration-150 ${estado.isDraggingOver ? "bg-primary/[0.06]" : ""}`}>
                        {lista.map((t, i) => (
                          <Draggable key={t.id} draggableId={t.id} index={i}>
                            {(drag, d) => (
                              <div ref={drag.innerRef} {...drag.draggableProps} {...drag.dragHandleProps}>
                                <Tarjeta t={t} personas={personas} hoy={hoy} arrastrando={d.isDragging} onAbrir={() => onAbrir(t)} />
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {drop.placeholder}
                        {lista.length === 0 && !estado.isDraggingOver && (
                          <p className="px-2 py-6 text-center text-[13px] text-muted-foreground">{col.estado === "terminada" ? "Lo que termines hoy queda acá" : "Nada acá"}</p>
                        )}
                      </div>
                    )}
                  </Droppable>
                </section>
              );
            })}
          </div>
        </div>
      </DragDropContext>

      {/* Pasar a Trabadas pide el motivo */}
      <Dialog open={!!trabando} onOpenChange={(o) => !o && setTrabando(null)}>
        <DialogContent className="sm:max-w-md">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (trabando?.motivo.trim()) cambiar(trabando.id, { motivoTrabada: trabando.motivo.trim() });
              setTrabando(null);
            }}
            className="space-y-4"
          >
            <DialogHeader>
              <DialogTitle>¿Por qué está trabada?</DialogTitle>
              <DialogDescription>Así sabés qué destrabar. Lo podés dejar vacío.</DialogDescription>
            </DialogHeader>
            <Input autoFocus value={trabando?.motivo ?? ""} onChange={(e) => setTrabando((t) => (t ? { ...t, motivo: e.target.value } : t))} placeholder="Falta filamento PETG negro" />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setTrabando(null)}>
                Sin motivo
              </Button>
              <Button type="submit">Guardar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
