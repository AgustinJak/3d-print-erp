"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  Zap, Search, Plus, Trash2, ChevronDown, ChevronUp,
  Calendar, Flame, Pencil, Loader2, RefreshCw, Link2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
/* simple alert helper (no sonner dependency) */
const notify = {
  success: (msg: string) => { console.log("\u2705", msg); },
  error: (msg: string) => { console.error("\u274C", msg); alert(msg); },
};

/* ────────── types ────────── */

interface ModeloRef {
  id: string;
  nombre: string;
  imagenUrl: string | null;
}

interface Sugerencia {
  id?: string;
  nombre: string;
  tipoProducto: string;
  dificultad: string;
  potencialVenta: number;
  ventanaInicio: string;
  modeloVinculadoId?: string | null;
  modeloVinculado?: ModeloRef | null;
}

interface Evento {
  id: string;
  titulo: string;
  tipo: string;
  fecha: string;
  fechaFin: string | null;
  descripcion: string | null;
  imagenUrl: string | null;
  nivelViral: string;
  fuente: string;
  sugerencias: Sugerencia[];
}

/* ────────── constants ────────── */

const TIPOS = [
  { value: "pelicula", label: "Pelicula", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  { value: "serie", label: "Serie", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  { value: "anime", label: "Anime", color: "bg-pink-500/20 text-pink-400 border-pink-500/30" },
  { value: "concierto", label: "Concierto", color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  { value: "fecha_comercial", label: "Fecha comercial", color: "bg-green-500/20 text-green-400 border-green-500/30" },
  { value: "gaming", label: "Gaming", color: "bg-red-500/20 text-red-400 border-red-500/30" },
  { value: "evento", label: "Evento", color: "bg-gray-500/20 text-gray-400 border-gray-500/30" },
];

const NIVELES_VIRAL = [
  { value: "bajo", label: "Bajo", fires: 1, color: "text-slate-400" },
  { value: "medio", label: "Medio", fires: 2, color: "text-yellow-400" },
  { value: "alto", label: "Alto", fires: 3, color: "text-orange-400" },
  { value: "explosivo", label: "Explosivo", fires: 4, color: "text-red-500" },
];

const TIPOS_PRODUCTO = [
  { value: "replica", label: "Replica" },
  { value: "accesorio", label: "Accesorio" },
  { value: "decoracion", label: "Decoracion" },
  { value: "funcional", label: "Funcional" },
  { value: "soporte", label: "Soporte" },
  { value: "llavero", label: "Llavero" },
];

const DIFICULTADES = [
  { value: "baja", label: "Baja", color: "bg-green-500/20 text-green-400 border-green-500/30" },
  { value: "media", label: "Media", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  { value: "alta", label: "Alta", color: "bg-red-500/20 text-red-400 border-red-500/30" },
];

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

/* ────────── helpers ────────── */

function getTipoMeta(tipo: string) {
  return TIPOS.find((t) => t.value === tipo) || TIPOS[TIPOS.length - 1];
}

function getNivelMeta(nivel: string) {
  return NIVELES_VIRAL.find((n) => n.value === nivel) || NIVELES_VIRAL[0];
}

function getDificultadMeta(dif: string) {
  return DIFICULTADES.find((d) => d.value === dif) || DIFICULTADES[0];
}

function parseDate(dateStr: string) {
  // Handle both "2026-06-21" and "2026-06-21T00:00:00.000Z"
  const s = dateStr.slice(0, 10);
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDateES(dateStr: string) {
  const d = parseDate(dateStr);
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysDiff(a: Date, b: Date) {
  return Math.floor((b.getTime() - a.getTime()) / 86400000);
}

function monthLabel(dateStr: string) {
  const d = parseDate(dateStr);
  return `${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

/* ────────── empty form ────────── */

const emptySugerencia: Sugerencia = {
  nombre: "",
  tipoProducto: "replica",
  dificultad: "media",
  potencialVenta: 2,
  ventanaInicio: "",
  modeloVinculadoId: null,
  modeloVinculado: null,
};

const emptyForm = {
  titulo: "",
  tipo: "evento",
  fecha: new Date().toISOString().slice(0, 10),
  fechaFin: "",
  descripcion: "",
  imagenUrl: "",
  nivelViral: "medio",
  fuente: "manual",
  sugerencias: [] as Sugerencia[],
};

/* ────────── Viral fires component ────────── */

function ViralFires({ nivel }: { nivel: string }) {
  const meta = getNivelMeta(nivel);
  const isExplosivo = nivel === "explosivo";
  return (
    <span className={`inline-flex items-center gap-0.5 ${meta.color} ${isExplosivo ? "animate-pulse" : ""}`}>
      {Array.from({ length: meta.fires }).map((_, i) => (
        <span key={i}>🔥</span>
      ))}
    </span>
  );
}

/* ────────── Model link popover ────────── */

function VincularModeloPopover({
  sugerencia,
  modelos,
  onLink,
}: {
  sugerencia: Sugerencia;
  modelos: ModeloRef[];
  onLink: (sugerenciaId: string, modeloId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const filtered = modelos.filter((m) =>
    m.nombre.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (sugerencia.modeloVinculado) {
    return (
      <div className="flex items-center gap-1.5 text-xs">
        {sugerencia.modeloVinculado.imagenUrl && (
          <img
            src={sugerencia.modeloVinculado.imagenUrl}
            alt=""
            className="h-5 w-5 rounded object-cover"
          />
        )}
        <a
          href={`/modelos/${sugerencia.modeloVinculado.id}`}
          className="text-blue-400 hover:underline flex items-center gap-1"
        >
          <Link2 className="h-3 w-3" />
          {sugerencia.modeloVinculado.nombre}
        </a>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (sugerencia.id) onLink(sugerencia.id, null);
          }}
          className="text-muted-foreground hover:text-destructive ml-0.5"
          title="Desvincular modelo"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={(o) => setOpen(o)}>
      <PopoverTrigger
        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
      >
        <Link2 className="h-3 w-3" />
        Vincular modelo
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <Input
          placeholder="Buscar modelo..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="mb-2 h-8 text-xs"
        />
        <div className="max-h-48 overflow-y-auto space-y-0.5">
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground p-2 text-center">Sin resultados</p>
          )}
          {filtered.map((m) => (
            <button
              key={m.id}
              className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-accent flex items-center gap-2 transition-colors"
              onClick={() => {
                if (sugerencia.id) {
                  onLink(sugerencia.id, m.id);
                  setOpen(false);
                  setSearchTerm("");
                }
              }}
            >
              {m.imagenUrl && (
                <img src={m.imagenUrl} alt="" className="h-5 w-5 rounded object-cover shrink-0" />
              )}
              <span className="truncate">{m.nombre}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ────────── Event card ────────── */

function EventoCard({
  evento,
  modelos,
  onEdit,
  onDelete,
  onLinkModelo,
}: {
  evento: Evento;
  modelos: ModeloRef[];
  onEdit: (e: Evento) => void;
  onDelete: (id: string) => void;
  onLinkModelo: (sugerenciaId: string, modeloId: string | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const tipoMeta = getTipoMeta(evento.tipo);

  const vinculadas = evento.sugerencias.filter((s) => s.modeloVinculado).length;

  return (
    <Card className="group relative transition-all hover:shadow-md">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <Badge variant="outline" className={`text-xs ${tipoMeta.color}`}>
                {tipoMeta.label}
              </Badge>
              <ViralFires nivel={evento.nivelViral} />
            </div>
            <h3 className="font-semibold text-base truncate">{evento.titulo}</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              <Calendar className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
              {formatDateES(evento.fecha)}
              {evento.fechaFin && ` \u2014 ${formatDateES(evento.fechaFin)}`}
            </p>
            {evento.descripcion && (
              <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{evento.descripcion}</p>
            )}
          </div>
          <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(evento)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDelete(evento.id)}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        </div>

        {/* sugerencias */}
        {evento.sugerencias && evento.sugerencias.length > 0 && (
          <div className="mt-3">
            <button
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {evento.sugerencias.length} sugerencia{evento.sugerencias.length !== 1 ? "s" : ""} de producto
              {vinculadas > 0 && (
                <Badge variant="secondary" className="text-[10px] ml-1 px-1.5 py-0">
                  {vinculadas} vinculado{vinculadas !== 1 ? "s" : ""}
                </Badge>
              )}
            </button>
            {expanded && (
              <div className="mt-2 space-y-2">
                {evento.sugerencias.map((s, i) => {
                  const difMeta = getDificultadMeta(s.dificultad);
                  const tipoProd = TIPOS_PRODUCTO.find((t) => t.value === s.tipoProducto);
                  return (
                    <div key={s.id || i} className="rounded-md border p-2 text-sm space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{s.nombre}</span>
                        {tipoProd && (
                          <Badge variant="outline" className="text-xs">{tipoProd.label}</Badge>
                        )}
                        <Badge variant="outline" className={`text-xs ${difMeta.color}`}>
                          {difMeta.label}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span>
                          Potencial:{" "}
                          {Array.from({ length: s.potencialVenta }).map((_, j) => (
                            <span key={j}>🔥</span>
                          ))}
                        </span>
                        {s.ventanaInicio && <span>Empezar: {s.ventanaInicio}</span>}
                      </div>
                      {/* modelo vinculado */}
                      <div className="pt-1">
                        <VincularModeloPopover
                          sugerencia={s}
                          modelos={modelos}
                          onLink={onLinkModelo}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ────────── Annual Calendar ────────── */

function CalendarioAnual({ eventos }: { eventos: Evento[] }) {
  const counts = new Map<number, number>();
  for (const ev of eventos) {
    const m = parseDate(ev.fecha).getMonth();
    counts.set(m, (counts.get(m) || 0) + 1);
  }
  const maxCount = Math.max(...Array.from(counts.values()), 1);

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-2">
      {MESES.map((mes, i) => {
        const c = counts.get(i) || 0;
        const intensity = c === 0 ? 0 : Math.ceil((c / maxCount) * 4);
        const bg = [
          "bg-muted/30",
          "bg-orange-500/10",
          "bg-orange-500/20",
          "bg-orange-500/40",
          "bg-orange-500/60",
        ][intensity];
        return (
          <div
            key={i}
            className={`rounded-lg p-2 text-center border transition-colors ${bg}`}
          >
            <div className="text-xs font-medium">{mes.slice(0, 3)}</div>
            <div className="text-lg font-bold mt-1">{c}</div>
            <div className="text-[10px] text-muted-foreground">evento{c !== 1 ? "s" : ""}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ────────── Main page ────────── */

export default function TendenciasPage() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [modelos, setModelos] = useState<ModeloRef[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [seedLoading, setSeedLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);

  // filters
  const [search, setSearch] = useState("");
  const [filterTipo, setFilterTipo] = useState("todos");
  const [filterNivel, setFilterNivel] = useState("todos");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  /* ── fetch ── */
  const fetchEventos = useCallback(async () => {
    try {
      const res = await fetch("/api/tendencias");
      if (!res.ok) throw new Error();
      setEventos(await res.json());
    } catch {
      notify.error("Error al cargar tendencias");
    } finally {
      setInitialLoading(false);
    }
  }, []);

  const fetchModelos = useCallback(async () => {
    try {
      const res = await fetch("/api/modelos");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setModelos(
        data.map((m: Record<string, unknown>) => ({
          id: m.id as string,
          nombre: m.nombre as string,
          imagenUrl: (m.imagenUrl as string) || null,
        }))
      );
    } catch {
      // silent - modelos are optional for core functionality
    }
  }, []);

  useEffect(() => {
    fetchEventos();
    fetchModelos();
  }, [fetchEventos, fetchModelos]);

  /* ── link/unlink modelo to sugerencia ── */
  const handleLinkModelo = async (sugerenciaId: string, modeloId: string | null) => {
    try {
      const res = await fetch(`/api/tendencias/sugerencias/${sugerenciaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modeloVinculadoId: modeloId }),
      });
      if (!res.ok) throw new Error();
      notify.success(modeloId ? "Modelo vinculado" : "Modelo desvinculado");
      fetchEventos();
    } catch {
      notify.error("Error al vincular modelo");
    }
  };

  /* ── seed AR calendar ── */
  const handleSeed = async () => {
    setSeedLoading(true);
    try {
      const res = await fetch("/api/tendencias/seed", { method: "POST" });
      if (!res.ok) throw new Error();
      notify.success("Calendario AR cargado");
      fetchEventos();
    } catch {
      notify.error("Error al cargar calendario AR");
    } finally {
      setSeedLoading(false);
    }
  };

  /* ── sync TMDB + AniList ── */
  const handleSync = async () => {
    setSyncLoading(true);
    try {
      const res = await fetch("/api/tendencias/sync", { method: "POST" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      notify.success(data.message ?? "Sincronización completada");
      fetchEventos();
    } catch {
      notify.error("Error al sincronizar tendencias externas");
    } finally {
      setSyncLoading(false);
    }
  };

  /* ── filtering & sorting ── */
  const filtered = eventos
    .filter((ev) => {
      if (search && !ev.titulo.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterTipo !== "todos" && ev.tipo !== filterTipo) return false;
      if (filterNivel !== "todos" && ev.nivelViral !== filterNivel) return false;
      return true;
    })
    .sort((a, b) => {
      const diff = a.fecha.localeCompare(b.fecha);
      return sortDir === "asc" ? diff : -diff;
    });

  /* ── time buckets ── */
  const today = startOfDay(new Date());
  const in7 = new Date(today.getTime() + 7 * 86400000);
  const in30 = new Date(today.getTime() + 30 * 86400000);

  const estaSemana = filtered.filter((ev) => {
    const d = parseDate(ev.fecha);
    return d >= today && d < in7;
  });
  const esteMes = filtered.filter((ev) => {
    const d = parseDate(ev.fecha);
    return d >= in7 && d < in30;
  });
  const proximamente = filtered.filter((ev) => {
    const d = parseDate(ev.fecha);
    return d >= in30;
  });

  // group proximamente by month
  const proxByMonth = new Map<string, Evento[]>();
  for (const ev of proximamente) {
    const key = monthLabel(ev.fecha);
    if (!proxByMonth.has(key)) proxByMonth.set(key, []);
    proxByMonth.get(key)!.push(ev);
  }

  /* ── dialog handlers ── */
  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm, fecha: new Date().toISOString().slice(0, 10), sugerencias: [] });
    setDialogOpen(true);
  };

  const openEdit = (ev: Evento) => {
    setEditingId(ev.id);
    setForm({
      titulo: ev.titulo,
      tipo: ev.tipo,
      fecha: ev.fecha.slice(0, 10),
      fechaFin: ev.fechaFin?.slice(0, 10) || "",
      descripcion: ev.descripcion || "",
      imagenUrl: ev.imagenUrl || "",
      nivelViral: ev.nivelViral,
      fuente: ev.fuente || "manual",
      sugerencias: ev.sugerencias?.map((s) => ({ ...s })) || [],
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Eliminar este evento?")) return;
    try {
      await fetch(`/api/tendencias/${id}`, { method: "DELETE" });
      notify.success("Evento eliminado");
      fetchEventos();
    } catch {
      notify.error("Error al eliminar");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.titulo.trim() || !form.fecha) {
      notify.error("Titulo y fecha son obligatorios");
      return;
    }
    setSaving(true);
    try {
      const url = editingId ? `/api/tendencias/${editingId}` : "/api/tendencias";
      const method = editingId ? "PUT" : "POST";
      const body = {
        ...form,
        fechaFin: form.fechaFin || null,
        descripcion: form.descripcion || null,
        imagenUrl: form.imagenUrl || null,
        sugerencias: form.sugerencias.map((s) => ({
          nombre: s.nombre,
          tipoProducto: s.tipoProducto,
          dificultad: s.dificultad,
          potencialVenta: s.potencialVenta,
          ventanaInicio: s.ventanaInicio || null,
          modeloVinculadoId: s.modeloVinculadoId || null,
        })),
      };
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      notify.success(editingId ? "Evento actualizado" : "Evento creado");
      setDialogOpen(false);
      fetchEventos();
    } catch {
      notify.error("Error al guardar evento");
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  /* ── sugerencias handlers ── */
  const addSugerencia = () => {
    setForm((prev) => ({
      ...prev,
      sugerencias: [...prev.sugerencias, { ...emptySugerencia }],
    }));
  };

  const removeSugerencia = (idx: number) => {
    setForm((prev) => ({
      ...prev,
      sugerencias: prev.sugerencias.filter((_, i) => i !== idx),
    }));
  };

  const updateSugerencia = (idx: number, field: string, value: string | number | null) => {
    setForm((prev) => ({
      ...prev,
      sugerencias: prev.sugerencias.map((s, i) => (i === idx ? { ...s, [field]: value } : s)),
    }));
  };

  /* ── render helpers ── */
  const renderSection = (title: string, items: Evento[]) => {
    if (items.length === 0) return null;
    return (
      <section className="space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          {title}
          <Badge variant="secondary" className="text-xs">{items.length}</Badge>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {items.map((ev) => (
            <EventoCard
              key={ev.id}
              evento={ev}
              modelos={modelos}
              onEdit={openEdit}
              onDelete={handleDelete}
              onLinkModelo={handleLinkModelo}
            />
          ))}
        </div>
      </section>
    );
  };

  /* ── loading ── */
  if (initialLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="h-6 w-6 text-yellow-500" />
            Radar de Tendencias
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Detecta oportunidades de mercado para tu negocio 3D
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSync} disabled={syncLoading}>
            {syncLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Sincronizar tendencias
          </Button>
          <Button variant="outline" onClick={handleSeed} disabled={seedLoading}>
            {seedLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Calendar className="mr-2 h-4 w-4" />}
            Cargar calendario AR
          </Button>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Agregar evento
          </Button>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por titulo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterTipo} onValueChange={(v) => v && setFilterTipo(v)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los tipos</SelectItem>
            {TIPOS.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterNivel} onValueChange={(v) => v && setFilterNivel(v)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Nivel viral" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los niveles</SelectItem>
            {NIVELES_VIRAL.map((n) => (
              <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sortDir} onValueChange={(v) => v && setSortDir(v as "asc" | "desc")}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="asc">Fecha (ascendente)</SelectItem>
            <SelectItem value="desc">Fecha (descendente)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ── Empty state ── */}
      {filtered.length === 0 && (
        <div className="text-center py-16">
          <Zap className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <p className="mt-4 text-muted-foreground">
            {eventos.length === 0
              ? "No hay eventos cargados. Agrega uno o carga el calendario AR!"
              : "No se encontraron eventos con esos filtros."}
          </p>
        </div>
      )}

      {/* ── Esta Semana ── */}
      {renderSection("📅 Esta Semana", estaSemana)}

      {/* ── Este Mes ── */}
      {renderSection("📅 Este Mes", esteMes)}

      {/* ── Proximamente ── */}
      {Array.from(proxByMonth.entries()).map(([month, items]) => (
        <section key={month} className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            🚀 {month}
            <Badge variant="secondary" className="text-xs">{items.length}</Badge>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {items.map((ev) => (
              <EventoCard
                key={ev.id}
                evento={ev}
                modelos={modelos}
                onEdit={openEdit}
                onDelete={handleDelete}
                onLinkModelo={handleLinkModelo}
              />
            ))}
          </div>
        </section>
      ))}

      {/* ── Calendario Anual ── */}
      {eventos.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">📊 Calendario Anual</h2>
          <CalendarioAnual eventos={eventos} />
        </section>
      )}

      {/* ── Add/Edit Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Evento" : "Nuevo Evento"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* titulo */}
            <div className="space-y-2">
              <Label htmlFor="ev-titulo">Titulo *</Label>
              <Input
                id="ev-titulo"
                value={form.titulo}
                onChange={(e) => updateField("titulo", e.target.value)}
                placeholder="Ej: Estreno de Spider-Man 4"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* tipo */}
              <div className="space-y-2">
                <Label>Tipo *</Label>
                <Select value={form.tipo} onValueChange={(v) => v && updateField("tipo", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPOS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* nivel viral */}
              <div className="space-y-2">
                <Label>Nivel viral *</Label>
                <Select value={form.nivelViral} onValueChange={(v) => v && updateField("nivelViral", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {NIVELES_VIRAL.map((n) => (
                      <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* fecha */}
              <div className="space-y-2">
                <Label htmlFor="ev-fecha">Fecha *</Label>
                <Input
                  id="ev-fecha"
                  type="date"
                  value={form.fecha}
                  onChange={(e) => updateField("fecha", e.target.value)}
                  required
                />
              </div>

              {/* fechaFin */}
              <div className="space-y-2">
                <Label htmlFor="ev-fechaFin">Fecha fin (opcional)</Label>
                <Input
                  id="ev-fechaFin"
                  type="date"
                  value={form.fechaFin}
                  onChange={(e) => updateField("fechaFin", e.target.value)}
                />
              </div>
            </div>

            {/* descripcion */}
            <div className="space-y-2">
              <Label htmlFor="ev-desc">Descripcion</Label>
              <Textarea
                id="ev-desc"
                value={form.descripcion}
                onChange={(e) => updateField("descripcion", e.target.value)}
                placeholder="Detalles del evento..."
                rows={3}
              />
            </div>

            {/* imagenUrl */}
            <div className="space-y-2">
              <Label htmlFor="ev-img">URL de imagen (opcional)</Label>
              <Input
                id="ev-img"
                value={form.imagenUrl}
                onChange={(e) => updateField("imagenUrl", e.target.value)}
                placeholder="https://..."
              />
            </div>

            {/* ── Sugerencias ── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base">Sugerencias de producto</Label>
                <Button type="button" variant="outline" size="sm" onClick={addSugerencia}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Agregar
                </Button>
              </div>

              {form.sugerencias.map((sug, idx) => (
                <div key={idx} className="rounded-lg border p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">Sugerencia {idx + 1}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => removeSugerencia(idx)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Nombre *</Label>
                      <Input
                        value={sug.nombre}
                        onChange={(e) => updateSugerencia(idx, "nombre", e.target.value)}
                        placeholder="Ej: Mascara de Spider-Man"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Tipo producto</Label>
                      <Select
                        value={sug.tipoProducto}
                        onValueChange={(v) => v && updateSugerencia(idx, "tipoProducto", v)}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {TIPOS_PRODUCTO.map((t) => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Dificultad</Label>
                      <Select
                        value={sug.dificultad}
                        onValueChange={(v) => v && updateSugerencia(idx, "dificultad", v)}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {DIFICULTADES.map((d) => (
                            <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Potencial de venta (1-3)</Label>
                      <Select
                        value={sug.potencialVenta.toString()}
                        onValueChange={(v) => v && updateSugerencia(idx, "potencialVenta", parseInt(v))}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">🔥 Bajo</SelectItem>
                          <SelectItem value="2">🔥🔥 Medio</SelectItem>
                          <SelectItem value="3">🔥🔥🔥 Alto</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Ventana de inicio</Label>
                      <Input
                        value={sug.ventanaInicio}
                        onChange={(e) => updateSugerencia(idx, "ventanaInicio", e.target.value)}
                        placeholder="Ej: 2 semanas antes del estreno"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Modelo del catalogo</Label>
                      <Select
                        value={sug.modeloVinculadoId || "__none__"}
                        onValueChange={(v) => v && updateSugerencia(idx, "modeloVinculadoId", v === "__none__" ? null : v)}
                      >
                        <SelectTrigger><SelectValue placeholder="Sin vincular" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Sin vincular</SelectItem>
                          {modelos.map((m) => (
                            <SelectItem key={m.id} value={m.id}>{m.nombre}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* ── Actions ── */}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  "Guardar"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
