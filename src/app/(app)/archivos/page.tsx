"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Box, Download, FileBox, Folder, Loader2, Pencil, Search, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Segmentado } from "@/components/segmentado";
import { Visor3d } from "@/components/archivos/visor-3d";
import { descargar, guardarMiniatura, linkDe, subirArchivo } from "@/components/archivos/subir";
import { SE_VE_EN_3D, tamanoLegible } from "@/lib/tareas-reglas";
import type { ArchivoVista } from "@/lib/tareas";

/**
 * Archivos 3D (docs/sdd/012): la biblioteca del taller. Se suben arrastrando, quedan privados, se
 * ven en 3D (STL, 3MF, OBJ) y se bajan con un link que vence. Se pueden adjuntar a las tareas.
 */

const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });

export default function ArchivosPage() {
  const [lista, setLista] = useState<ArchivoVista[] | null>(null);
  const [q, setQ] = useState("");
  const [carpeta, setCarpeta] = useState<string>("todas");
  const [subiendo, setSubiendo] = useState<Array<{ nombre: string; listo: boolean; error?: string }>>([]);
  const [arrastrando, setArrastrando] = useState(false);
  const [viendo, setViendo] = useState<{ archivo: ArchivoVista; url: string } | null>(null);
  const [editando, setEditando] = useState<ArchivoVista | null>(null);
  const [borrando, setBorrando] = useState<ArchivoVista | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    const r = await fetch("/api/archivos");
    const j = await r.json();
    if (r.ok) setLista(j.archivos);
    else toast.error(j.error ?? "No se pudo leer la biblioteca");
  }, []);
  useEffect(() => {
    // Se lee al abrir; después, al subir o cambiar algo.
    cargar();
  }, [cargar]);

  const carpetas = useMemo(() => [...new Set((lista ?? []).map((a) => a.carpeta).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, "es")), [lista]);
  const visibles = (lista ?? []).filter((a) => (carpeta === "todas" || (carpeta === "sin" ? !a.carpeta : a.carpeta === carpeta)) && (!q.trim() || `${a.nombre} ${a.carpeta ?? ""} ${a.etiquetas.join(" ")}`.toLowerCase().includes(q.trim().toLowerCase())));
  const total = (lista ?? []).reduce((s, a) => s + a.tamano, 0);

  const subir = async (files: FileList | File[]) => {
    const fs = [...files];
    if (!fs.length) return;
    const destino = carpeta !== "todas" && carpeta !== "sin" ? carpeta : null;
    setSubiendo(fs.map((f) => ({ nombre: f.name, listo: false })));
    let ok = 0;
    // De a dos a la vez: archivos grandes en paralelo saturan la conexión.
    for (let i = 0; i < fs.length; i += 2) {
      await Promise.all(
        fs.slice(i, i + 2).map(async (f, k) => {
          try {
            await subirArchivo(f, destino);
            ok++;
            setSubiendo((s) => s.map((x, j) => (j === i + k ? { ...x, listo: true } : x)));
          } catch (e) {
            setSubiendo((s) => s.map((x, j) => (j === i + k ? { ...x, listo: true, error: e instanceof Error ? e.message : String(e) } : x)));
          }
        })
      );
    }
    if (ok) toast.success(ok === 1 ? "Archivo subido" : `${ok} archivos subidos`);
    await cargar();
    setTimeout(() => setSubiendo((s) => s.filter((x) => x.error)), 1500);
  };

  const ver = async (a: ArchivoVista) => {
    try {
      const { url } = await linkDe(a.id, false);
      setViendo({ archivo: a, url });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo abrir");
    }
  };

  const guardarEdicion = async (nombre: string, carpetaNueva: string, etiquetas: string) => {
    if (!editando) return;
    const r = await fetch(`/api/archivos/${editando.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, carpeta: carpetaNueva, etiquetas: etiquetas.split(",").map((e) => e.trim()) }),
    });
    if (!r.ok) return toast.error("No se pudo guardar");
    setEditando(null);
    cargar();
  };

  const borrar = async () => {
    if (!borrando) return;
    const r = await fetch(`/api/archivos/${borrando.id}`, { method: "DELETE" });
    if (!r.ok) return toast.error("No se pudo borrar");
    toast.success(`Borrado: ${borrando.nombre}`);
    setBorrando(null);
    cargar();
  };

  return (
    <motion.div
      className="mx-auto max-w-[1440px] space-y-6"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      onDragOver={(e) => {
        e.preventDefault();
        setArrastrando(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setArrastrando(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setArrastrando(false);
        subir(e.dataTransfer.files);
      }}
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] leading-[1.15] font-medium">Archivos 3D</h1>
          <p className="text-sm text-muted-foreground">
            {lista ? `${lista.length} ${lista.length === 1 ? "archivo" : "archivos"} · ${tamanoLegible(total)} · privados` : "La biblioteca del taller"}
          </p>
        </div>
        <Button onClick={() => entrada.current?.click()}>
          <Upload className="h-4 w-4" strokeWidth={1.5} /> Subir archivos
        </Button>
        <input ref={entrada} type="file" multiple className="hidden" onChange={(e) => e.target.files && subir(e.target.files)} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.5} />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" className="pl-9" />
        </div>
        {carpetas.length > 0 && (
          <Segmentado
            etiqueta="Carpeta"
            valor={carpeta}
            onChange={setCarpeta}
            opciones={[["todas", "Todas"], ...carpetas.map((c) => [c, c] as const), ["sin", "Sin carpeta"]]}
          />
        )}
      </div>

      {/* Lo que se está subiendo */}
      {subiendo.length > 0 && (
        <div className="space-y-1 rounded-xl border bg-card p-3 text-sm">
          {subiendo.map((s, i) => (
            <p key={i} className="flex items-center gap-2">
              {s.listo ? <span className={`h-2 w-2 rounded-full ${s.error ? "bg-red-500" : "bg-emerald-500"}`} /> : <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              <span className="truncate">{s.nombre}</span>
              {s.error && <span className="text-xs text-red-600 dark:text-red-400">{s.error}</span>}
            </p>
          ))}
        </div>
      )}

      {/* La zona para soltar */}
      <div className={`rounded-xl border border-dashed p-5 text-center text-sm transition-colors duration-150 ${arrastrando ? "border-primary bg-primary/[0.06] text-foreground" : "text-muted-foreground"}`}>
        Arrastrá archivos acá (STL, 3MF, OBJ, STEP o lo que sea){carpeta !== "todas" && carpeta !== "sin" ? ` · van a ${carpeta}` : ""}
      </div>

      {!lista ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[4/5] rounded-xl" />
          ))}
        </div>
      ) : visibles.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">{lista.length ? "Nada coincide con la búsqueda" : "Todavía no hay archivos. Subí el primero."}</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {visibles.map((a) => {
            const enVisor = SE_VE_EN_3D.has(a.extension ?? "");
            return (
              <article key={a.id} className="group overflow-hidden rounded-xl border bg-card transition-colors duration-150 hover:border-foreground/20">
                <button type="button" onClick={() => (enVisor ? ver(a) : descargar(a.id))} className="relative block aspect-square w-full bg-muted/50" title={enVisor ? "Ver en 3D" : "Descargar"}>
                  {a.miniatura ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.miniatura} alt="" className="h-full w-full object-contain p-3" />
                  ) : (
                    <span className="flex h-full items-center justify-center">
                      {enVisor ? <Box className="h-10 w-10 text-muted-foreground/40" strokeWidth={1.5} /> : <FileBox className="h-10 w-10 text-muted-foreground/40" strokeWidth={1.5} />}
                    </span>
                  )}
                  <span className="absolute top-2 left-2 rounded-md bg-background/90 px-1.5 py-0.5 font-mono text-[11px] uppercase text-muted-foreground">{a.extension ?? "?"}</span>
                </button>
                <div className="space-y-1 p-3">
                  <p className="truncate text-sm font-medium" title={a.nombre}>
                    {a.nombre}
                  </p>
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span className="font-mono tabular-nums">{tamanoLegible(a.tamano)}</span>
                    {a.carpeta && (
                      <span className="inline-flex items-center gap-1">
                        <Folder className="h-3 w-3" strokeWidth={1.5} /> {a.carpeta}
                      </span>
                    )}
                    {a.tareas > 0 && <span>{a.tareas} {a.tareas === 1 ? "tarea" : "tareas"}</span>}
                  </p>
                  <div className="flex items-center gap-1 pt-1">
                    <Button size="sm" variant="outline" className="h-7 flex-1" onClick={() => descargar(a.id)}>
                      <Download className="h-3.5 w-3.5" strokeWidth={1.5} /> Bajar
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => setEditando(a)} title="Renombrar o mover" aria-label="Renombrar o mover">
                      <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-red-600" onClick={() => setBorrando(a)} title="Borrar" aria-label="Borrar">
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* El visor */}
      <Dialog open={!!viendo} onOpenChange={(o) => !o && setViendo(null)}>
        <DialogContent className="sm:max-w-3xl">
          {viendo && (
            <>
              <DialogHeader>
                <DialogTitle className="truncate pr-8">{viendo.archivo.nombre}</DialogTitle>
                <DialogDescription>
                  {tamanoLegible(viendo.archivo.tamano)} · subido el {fecha(viendo.archivo.creadoEn)} · arrastrá para girarlo
                </DialogDescription>
              </DialogHeader>
              <div className="h-[60vh] min-h-[320px]">
                <Visor3d
                  url={viendo.url}
                  extension={viendo.archivo.extension ?? ""}
                  onMiniatura={
                    viendo.archivo.miniatura
                      ? undefined
                      : async (png) => {
                          await guardarMiniatura(viendo.archivo.id, png);
                          cargar();
                        }
                  }
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setViendo(null)}>
                  Cerrar
                </Button>
                <Button onClick={() => descargar(viendo.archivo.id)}>
                  <Download className="h-4 w-4" strokeWidth={1.5} /> Descargar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Renombrar o mover */}
      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent className="sm:max-w-md">
          {editando && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                guardarEdicion(String(f.get("nombre")), String(f.get("carpeta")), String(f.get("etiquetas")));
              }}
              className="space-y-4"
            >
              <DialogHeader>
                <DialogTitle>Renombrar o mover</DialogTitle>
              </DialogHeader>
              <label className="block space-y-1.5 text-sm">
                <span className="text-muted-foreground">Nombre</span>
                <Input name="nombre" defaultValue={editando.nombre} required />
              </label>
              <label className="block space-y-1.5 text-sm">
                <span className="text-muted-foreground">Carpeta</span>
                <Input name="carpeta" defaultValue={editando.carpeta ?? ""} list="carpetas" placeholder="Katanas, Porta auriculares…" />
                <datalist id="carpetas">
                  {carpetas.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </label>
              <label className="block space-y-1.5 text-sm">
                <span className="text-muted-foreground">Etiquetas, separadas por coma</span>
                <Input name="etiquetas" defaultValue={editando.etiquetas.join(", ")} placeholder="v2, para imprimir" />
              </label>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditando(null)}>
                  Cancelar
                </Button>
                <Button type="submit">Guardar</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Borrar */}
      <Dialog open={!!borrando} onOpenChange={(o) => !o && setBorrando(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Borrar {borrando?.nombre}?</DialogTitle>
            <DialogDescription>Se borra del almacenamiento y no se puede recuperar.{borrando?.tareas ? ` Se desengancha de ${borrando.tareas} ${borrando.tareas === 1 ? "tarea" : "tareas"}.` : ""}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBorrando(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={borrar}>
              Borrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
