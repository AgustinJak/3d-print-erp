"use client";

import { useEffect, useState } from "react";
import { Box, Check, Download, Paperclip, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { descargar } from "@/components/archivos/subir";
import { conJson, pedirJson, type Persona } from "@/components/tareas/comun";
import type { ArchivoVista, TareaVista } from "@/lib/tareas";

/**
 * El detalle de una tarea (docs/sdd/012): título, nota, responsable, prioridad, fecha límite, los
 * pasos con tildes y los archivos 3D adjuntos. Se guarda al apretar Guardar. Una tarea sin id es
 * una nueva (ver `tareaNueva`): Guardar la crea.
 */

/** Una tarea en blanco para el botón "Nueva tarea". */
export function tareaNueva(estado: TareaVista["estado"] = "por_hacer", responsableId: string | null = null): TareaVista {
  return {
    id: "",
    titulo: "",
    nota: null,
    estado,
    orden: 0,
    prioridad: "normal",
    responsableId,
    fechaLimite: null,
    motivoTrabada: null,
    pasos: [],
    terminadaEn: null,
    recurrenteId: null,
    creadaEn: new Date().toISOString(),
    archivos: [],
  };
}

const NOMBRE_ESTADO: Record<TareaVista["estado"], string> = { por_hacer: "Por hacer", haciendo: "Haciendo", trabada: "Trabada", terminada: "Terminada" };

export function EditorDeTarea({
  tarea,
  personas,
  onCerrar,
  onGuardada,
  onBorrada,
}: {
  tarea: TareaVista | null;
  personas: Persona[];
  onCerrar: () => void;
  onGuardada: (t: TareaVista) => void;
  onBorrada: (id: string) => void;
}) {
  const [f, setF] = useState<TareaVista | null>(tarea);
  const [paso, setPaso] = useState("");
  const [biblioteca, setBiblioteca] = useState<ArchivoVista[] | null>(null);
  const [eligiendo, setEligiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    // Al abrir otra tarea, el formulario arranca con sus datos.
    setF(tarea);
    setEligiendo(false);
  }, [tarea]);

  const abrirBiblioteca = async () => {
    setEligiendo(true);
    if (!biblioteca) setBiblioteca((await pedirJson<{ archivos: ArchivoVista[] }>("/api/archivos").catch(() => ({ archivos: [] }))).archivos);
  };

  if (!f) return <Dialog open={false} />;
  const set = (c: Partial<TareaVista>) => setF((x) => (x ? { ...x, ...c } : x));
  const nueva = !f.id;

  const guardar = async () => {
    if (!f.titulo.trim()) return toast.error("Falta el título");
    setGuardando(true);
    const datos = {
      titulo: f.titulo,
      nota: f.nota,
      responsableId: f.responsableId,
      prioridad: f.prioridad,
      fechaLimite: f.fechaLimite,
      motivoTrabada: f.estado === "trabada" ? f.motivoTrabada : undefined,
      pasos: f.pasos,
      archivos: f.archivos.map((a) => a.id),
    };
    try {
      const t = nueva
        ? await pedirJson<TareaVista>("/api/tareas", conJson("POST", { ...datos, estado: f.estado }))
        : await pedirJson<TareaVista>(`/api/tareas/${f.id}`, conJson("PATCH", datos));
      onGuardada(t);
      onCerrar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async () => {
    try {
      await pedirJson(`/api/tareas/${f.id}`, { method: "DELETE" });
      onBorrada(f.id);
      onCerrar();
    } catch {
      toast.error("No se pudo borrar");
    }
  };

  const hechos = f.pasos.filter((p) => p.hecho).length;

  return (
    <Dialog open={!!tarea} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-x-hidden overflow-y-auto p-0 sm:max-w-xl">
        <DialogHeader className="min-w-0 border-b p-5 pr-12">
          <DialogTitle className="sr-only">{nueva ? "Nueva tarea" : "Editar la tarea"}</DialogTitle>
          <Input
            value={f.titulo}
            onChange={(e) => set({ titulo: e.target.value })}
            autoFocus={nueva}
            placeholder="Qué hay que hacer"
            className="h-auto min-w-0 border-0 bg-transparent px-0 text-lg font-medium shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
          <DialogDescription className="text-xs">
            {nueva ? (
              "Nueva tarea"
            ) : (
              <>
                Creada el {new Date(f.creadaEn).toLocaleDateString("es-AR", { day: "numeric", month: "short" })}
                {f.terminadaEn && ` · terminada el ${new Date(f.terminadaEn).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`}
                {f.recurrenteId && " · se repite"}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="min-w-0 space-y-5 p-5">
          {nueva && (
            <div className="flex flex-wrap gap-1.5">
              {(["por_hacer", "haciendo", "trabada"] as const).map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => set({ estado: e })}
                  aria-pressed={f.estado === e}
                  className={`h-8 rounded-lg px-3 text-sm transition-colors duration-150 ${f.estado === e ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"}`}
                >
                  {NOMBRE_ESTADO[e]}
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="space-y-1.5 text-sm">
              <span className="text-xs text-muted-foreground">Responsable</span>
              <select value={f.responsableId ?? ""} onChange={(e) => set({ responsableId: e.target.value || null })} className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm">
                <option value="">Sin asignar</option>
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="text-xs text-muted-foreground">Prioridad</span>
              <select value={f.prioridad} onChange={(e) => set({ prioridad: e.target.value })} className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm">
                <option value="baja">Baja</option>
                <option value="normal">Normal</option>
                <option value="alta">Alta</option>
              </select>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="text-xs text-muted-foreground">Para cuándo</span>
              <Input type="date" value={f.fechaLimite ?? ""} onChange={(e) => set({ fechaLimite: e.target.value || null })} className="h-9" />
            </label>
          </div>

          {f.estado === "trabada" && (
            <label className="block space-y-1.5 text-sm">
              <span className="text-xs text-muted-foreground">Por qué está trabada</span>
              <Input value={f.motivoTrabada ?? ""} onChange={(e) => set({ motivoTrabada: e.target.value })} placeholder="Falta filamento PETG negro" />
            </label>
          )}

          <label className="block space-y-1.5 text-sm">
            <span className="text-xs text-muted-foreground">Nota</span>
            <Textarea value={f.nota ?? ""} onChange={(e) => set({ nota: e.target.value })} rows={3} placeholder="Detalles, medidas, links…" />
          </label>

          {/* Los pasos */}
          <section className="space-y-2">
            <h3 className="flex items-baseline justify-between text-sm font-medium">
              Pasos {f.pasos.length > 0 && <span className="font-mono text-xs text-muted-foreground">{hechos}/{f.pasos.length}</span>}
            </h3>
            {f.pasos.map((p, i) => (
              <div key={i} className="group flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => set({ pasos: f.pasos.map((x, j) => (j === i ? { ...x, hecho: !x.hecho } : x)) })}
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${p.hecho ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}
                  aria-label={p.hecho ? "Desmarcar" : "Marcar hecho"}
                >
                  {p.hecho && <Check className="h-3 w-3" strokeWidth={2.5} />}
                </button>
                <span className={`flex-1 text-sm ${p.hecho ? "text-muted-foreground line-through" : ""}`}>{p.texto}</span>
                <button type="button" onClick={() => set({ pasos: f.pasos.filter((_, j) => j !== i) })} className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-label="Quitar el paso">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!paso.trim()) return;
                set({ pasos: [...f.pasos, { texto: paso.trim(), hecho: false }] });
                setPaso("");
              }}
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
              <input value={paso} onChange={(e) => setPaso(e.target.value)} placeholder="Agregar un paso" className="h-8 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
            </form>
          </section>

          {/* Los archivos */}
          <section className="space-y-2">
            <h3 className="text-sm font-medium">Archivos</h3>
            {f.archivos.map((a) => (
              <div key={a.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                <Box className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
                <span className="flex-1 truncate">{a.nombre}</span>
                <button type="button" onClick={() => descargar(a.id)} className="text-muted-foreground transition-colors hover:text-foreground" aria-label="Descargar" title="Descargar">
                  <Download className="h-3.5 w-3.5" strokeWidth={1.5} />
                </button>
                <button type="button" onClick={() => set({ archivos: f.archivos.filter((x) => x.id !== a.id) })} className="text-muted-foreground transition-colors hover:text-foreground" aria-label="Quitar">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {!eligiendo ? (
              <Button type="button" variant="outline" size="sm" onClick={abrirBiblioteca}>
                <Paperclip className="h-3.5 w-3.5" strokeWidth={1.5} /> Adjuntar de la biblioteca
              </Button>
            ) : (
              <div className="max-h-48 space-y-0.5 overflow-y-auto rounded-lg border p-1">
                {!biblioteca ? (
                  <p className="p-2 text-xs text-muted-foreground">Cargando…</p>
                ) : biblioteca.length === 0 ? (
                  <p className="p-2 text-xs text-muted-foreground">La biblioteca está vacía: subí archivos en Archivos 3D</p>
                ) : (
                  biblioteca
                    .filter((a) => !f.archivos.some((x) => x.id === a.id))
                    .map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => set({ archivos: [...f.archivos, { id: a.id, nombre: a.nombre, extension: a.extension }] })}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                      >
                        <span className="w-10 font-mono text-[11px] uppercase text-muted-foreground">{a.extension}</span>
                        <span className="flex-1 truncate">{a.nombre}</span>
                        {a.carpeta && <span className="text-xs text-muted-foreground">{a.carpeta}</span>}
                      </button>
                    ))
                )}
              </div>
            )}
          </section>
        </div>

        <DialogFooter className="border-t p-4 sm:justify-between">
          {nueva ? (
            <span />
          ) : (
            <Button variant="ghost" className="text-muted-foreground hover:text-red-600" onClick={borrar}>
              <Trash2 className="h-4 w-4" strokeWidth={1.5} /> Borrar
            </Button>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={guardando}>
              {guardando ? "Guardando…" : nueva ? "Crear tarea" : "Guardar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
