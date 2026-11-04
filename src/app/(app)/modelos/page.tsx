"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  Plus, Search, FileBox, LayoutGrid, TableIcon, ChevronDown, SlidersHorizontal, ArrowUpDown, Box, Combine, Download, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { TableSkeleton } from "@/components/data-loading";
import { EmptyState } from "@/components/empty-state";
import { PiezasNuevas } from "@/components/producto/piezas-nuevas";
import { costoModelo } from "@/lib/costos";
import { CrearMlMasivo, type ItemACrear } from "@/components/producto/crear-ml-masivo";
import type { CanalesDeModelo } from "@/app/api/modelos/canales/route";
import { ConfirmarFlex } from "@/components/precios/confirmar-flex";

/* ─── Types ────────────────────────────────────────────── */

interface Categoria {
  id: string;
  nombre: string;
  color: string | null;
}

interface Variante {
  nombre: string;
}

interface ModeloRef {
  id: string;
  nombre: string;
}

interface Modelo {
  id: string;
  nombre: string;
  sku: string | null;
  serie: string | null;
  consolidadoEnId?: string | null;
  consolidadoEn?: ModeloRef | null;
  pesoGr: number | null;
  costoFab: number;
  costoInsumos: number;
  precioVenta: number;
  precioCreditoPorc: number;
  precioMayorista: number | null;
  precioPromo: number | null;
  notas: string | null;
  archivo3mfUrl: string | null;
  imagenUrl: string | null;
  imagenesUrls: string[];
  activo: boolean;
  esInsumo?: boolean;
  creadoEn: string;
  categorias: Array<{
    categoria: Categoria;
  }>;
  variantes: Variante[];
}

type ViewMode = "table" | "cards";

/* ─── Category Filter Dropdown ─────────────────────────── */

function CategoryFilter({
  categorias,
  selected,
  onChange,
}: {
  categorias: Categoria[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const toggle = (id: string) => {
    onChange(
      selected.includes(id)
        ? selected.filter((s) => s !== id)
        : [...selected, id]
    );
  };

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="outline"
        className="w-full justify-between"
        onClick={() => setOpen(!open)}
        type="button"
      >
        <span className="truncate text-left">
          {selected.length === 0
            ? "Todas las categorías"
            : `${selected.length} categoría${selected.length > 1 ? "s" : ""}`}
        </span>
        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover p-1 shadow-md">
          {categorias.length === 0 && (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">Sin categorías</p>
          )}
          {categorias.map((c) => (
            <label
              key={c.id}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
            >
              <input
                type="checkbox"
                checked={selected.includes(c.id)}
                onChange={() => toggle(c.id)}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              {c.color && (
                <span
                  className="h-3 w-3 rounded-full shrink-0"
                  style={{ backgroundColor: c.color }}
                />
              )}
              {c.nombre}
            </label>
          ))}
          {selected.length > 0 && (
            <button
              type="button"
              className="mt-1 w-full rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
              onClick={() => onChange([])}
            >
              Limpiar filtro
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Category Badges ──────────────────────────────────── */

/** Cómo está el producto en Mercado Libre: publicaciones activas, pausadas, o sin publicar. */
function EstadoMl({ c }: { c: CanalesDeModelo | undefined }) {
  const total = c ? c.ml.activas + c.ml.pausadas + c.ml.otras : 0;
  if (!total) return <span className="text-xs text-muted-foreground">Sin publicar</span>;
  const partes = [c!.ml.activas ? `${c!.ml.activas} activa${c!.ml.activas === 1 ? "" : "s"}` : null, c!.ml.pausadas ? `${c!.ml.pausadas} pausada${c!.ml.pausadas === 1 ? "" : "s"}` : null, c!.ml.otras ? `${c!.ml.otras} sin leer` : null].filter(Boolean);
  return (
    <span className="text-xs">
      {partes.join(" · ")}
      {(c!.entrega.flex > 0 || c!.entrega.aPedido > 0) && (
        <span className="block text-muted-foreground">
          {[c!.entrega.flex ? `${c!.entrega.flex} con Flex` : null, c!.entrega.aPedido ? `${c!.entrega.aPedido} a pedido` : null].filter(Boolean).join(" · ")}
        </span>
      )}
      {c!.sinMl.length > 0 && <span className="block text-amber-600 dark:text-amber-400">{c!.sinMl.length} sin publicar</span>}
    </span>
  );
}

function CategoriaBadges({ categorias }: { categorias: Modelo["categorias"] }) {
  if (!categorias || categorias.length === 0) return <span className="text-muted-foreground text-sm">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {categorias.map(({ categoria: c }) => (
        <Badge
          key={c.id}
          variant="outline"
          className="gap-1"
          style={c.color ? { borderColor: c.color, color: c.color } : undefined}
        >
          {c.color && (
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
          )}
          {c.nombre}
        </Badge>
      ))}
    </div>
  );
}

/* ─── Helpers ──────────────────────────────────────────── */

function formatPrice(n: number) {
  return `$${n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/* ═══════════════════════════════════════════════════════ */

export default function ModelosPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [search, setSearch] = useState("");
  const [filterCategoriaIds, setFilterCategoriaIds] = useState<string[]>([]);
  const [filterEstado, setFilterEstado] = useState<"todos" | "activos" | "inactivos" | "insumos">("activos");
  const [filterExtras, setFilterExtras] = useState<{ con3mf: boolean; conImagen: boolean; conVariantes: boolean }>({ con3mf: false, conImagen: false, conVariantes: false });
  const [sortBy, setSortBy] = useState<"nuevo" | "antiguo" | "az" | "za">("nuevo");
  const [showExtraFilters, setShowExtraFilters] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  // "Nuevo producto": sólo el nombre; el resto se completa en su página (docs/sdd/004, spec 001).
  const [nuevo, setNuevo] = useState<{ nombre: string; serie: string } | null>(null);
  const [creando, setCreando] = useState(false);
  const [trayendo, setTrayendo] = useState(false);
  const [versionPiezas, setVersionPiezas] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);
  const [mostrarConsolidados, setMostrarConsolidados] = useState(false);
  const [filterSku, setFilterSku] = useState<"todos" | "con" | "sin">("todos");
  // Dónde está publicado cada producto, y lo que se hace en cantidad (Agustín, 2026-11-02). Los
  // precios se manejan en Precios: acá no se muestran ni se ordena por ellos.
  const [canales, setCanales] = useState<Record<string, CanalesDeModelo>>({});
  const [filterMl, setFilterMl] = useState<"todos" | "publicados" | "pausados" | "sin">("todos");
  const [filterWeb, setFilterWeb] = useState<"todos" | "si" | "no">("todos");
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [masivo, setMasivo] = useState<"crear" | "activar" | "desactivar" | "inmediata" | "a_pedido" | null>(null);
  const [aplicandoMasivo, setAplicandoMasivo] = useState(false);

  /* ─── Fetch ───────────────────────────────────────── */

  const fetchModelos = useCallback(async () => {
    const consolidados = mostrarConsolidados ? "incluir" : "ocultar";
    const [res, can] = await Promise.all([fetch(`/api/modelos?consolidados=${consolidados}`), fetch("/api/modelos/canales")]);
    setModelos(await res.json());
    if (can.ok) setCanales(await can.json());
  }, [mostrarConsolidados]);

  const fetchCategorias = useCallback(async () => {
    const res = await fetch("/api/categorias");
    setCategorias(await res.json());
  }, []);

  useEffect(() => {
    Promise.all([fetchModelos(), fetchCategorias()]).then(() => setInitialLoading(false));
  }, [fetchModelos, fetchCategorias]);

  // Enlaces viejos al lápiz: ?edit=<id> va a la página del producto; ?nuevo=1&nombre=Y abre el
  // alta corta (docs/sdd/004, spec 001, REQ-5).
  useEffect(() => {
    const editId = searchParams.get("edit");
    if (editId) {
      router.replace(`/modelos/${editId}`);
      return;
    }
    if (searchParams.get("nuevo") === "1") {
      const nombre = searchParams.get("nombre") || "";
      router.replace("/modelos");
      setTimeout(() => setNuevo({ nombre, serie: "" }), 0);
    }
  }, [searchParams, router]);

  if (initialLoading) return <TableSkeleton cols={8} />;

  /* ─── Filter ──────────────────────────────────────── */

  const filtered = modelos
    .filter((m) => {
      const matchSearch =
        m.nombre.toLowerCase().includes(search.toLowerCase()) ||
        m.serie?.toLowerCase().includes(search.toLowerCase());
      const matchCategoria =
        filterCategoriaIds.length === 0 ||
        m.categorias.some(({ categoria }) => filterCategoriaIds.includes(categoria.id));
      const matchEstado =
        filterEstado === "insumos" ? !!m.esInsumo :
        m.esInsumo ? false :
        filterEstado === "todos" ? true :
        filterEstado === "activos" ? m.activo :
        !m.activo;
      const match3mf = !filterExtras.con3mf || !!m.archivo3mfUrl;
      const matchImagen = !filterExtras.conImagen || !!m.imagenUrl;
      const matchVariantes = !filterExtras.conVariantes || (m.variantes && m.variantes.length > 0);
      const matchSku =
        filterSku === "todos" ? true :
        filterSku === "con" ? !!m.sku :
        !m.sku;
      const c = canales[m.id];
      const matchMl =
        filterMl === "todos" ? true :
        filterMl === "publicados" ? (c?.ml.activas ?? 0) > 0 :
        filterMl === "pausados" ? (c?.ml.pausadas ?? 0) > 0 :
        !c || c.ml.activas + c.ml.pausadas + c.ml.otras === 0 || c.sinMl.length > 0;
      const matchWeb = filterWeb === "todos" ? true : filterWeb === "si" ? (c?.web ?? 0) > 0 : !c || c.web === 0;
      return matchSearch && matchCategoria && matchEstado && match3mf && matchImagen && matchVariantes && matchSku && matchMl && matchWeb;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "az": return a.nombre.localeCompare(b.nombre, "es");
        case "za": return b.nombre.localeCompare(a.nombre, "es");
        case "antiguo": return new Date(a.creadoEn).getTime() - new Date(b.creadoEn).getTime();
        default: return new Date(b.creadoEn).getTime() - new Date(a.creadoEn).getTime();
      }
    });

  /* ─── En cantidad ────────────────────────────────── */

  // Las combinaciones sin publicar en ML de los productos elegidos.
  const itemsACrear: ItemACrear[] = [...elegidos].flatMap((id) => (canales[id]?.sinMl ?? []).map((c) => ({ modeloId: id, combinacionId: c.id, nombre: c.nombre })));

  // Las publicaciones de ML (activas y pausadas) de los productos elegidos, para la entrega.
  const mlasElegidas = [...new Set([...elegidos].flatMap((id) => canales[id]?.mlas ?? []))];

  const cambiarActivo = async () => {
    const activo = masivo === "activar";
    setAplicandoMasivo(true);
    let ok = 0;
    for (const id of elegidos) {
      const r = await fetch(`/api/modelos/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ activo }) });
      if (r.ok) ok++;
    }
    setAplicandoMasivo(false);
    toast.success(`${ok} ${ok === 1 ? "producto" : "productos"} ${activo ? "activado" : "desactivado"}${ok === 1 ? "" : "s"}`);
    setMasivo(null);
    setElegidos(new Set());
    fetchModelos();
  };

  /* ─── Alta ───────────────────────────────────────── */

  const crearProducto = async () => {
    if (!nuevo?.nombre.trim()) return;
    setCreando(true);
    try {
      const res = await fetch("/api/modelos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nuevo.nombre.trim(), serie: nuevo.serie.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "No se pudo crear");
      toast.success("Producto creado");
      router.push(`/modelos/${data.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear");
      setCreando(false);
    }
  };

  /** Trae ya lo nuevo de Bodega. Si no hay nada, dice de cuándo es lo último que subió. */
  const traerDeBodega = async () => {
    setTrayendo(true);
    try {
      const res = await fetch("/api/bodega/altas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "traer" }),
      });
      const r = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(r?.error || "No se pudo traer");
      const traidas: string[] = [...(r.creados ?? []), ...(r.mapeados ?? [])].map((x: { nombre: string }) => x.nombre);
      const omitidas: Array<{ nombre: string; motivo: string }> = r.omitidos ?? [];
      if (traidas.length > 0) toast.success(`${traidas.length === 1 ? "Traída" : `${traidas.length} traídas`}: ${traidas.join(", ")}`);
      for (const o of omitidas) toast.error(`${o.nombre}: ${o.motivo}`);
      const costos: number = r.costosActualizados ?? 0;
      if (costos > 0) toast.success(`Costos actualizados desde Bodega: ${costos} ${costos === 1 ? "producto" : "productos"}`);
      if (traidas.length === 0 && omitidas.length === 0 && costos === 0) {
        const fecha = r.ultimaSubida ? new Date(r.ultimaSubida).toLocaleDateString("es-AR", { day: "numeric", month: "numeric" }) : "nunca";
        toast.info(
          `No hay piezas nuevas. Lo último que subió Bodega es del ${fecha}. Si creaste una después, abrí Bodega › Configuración y fijate que la sincronización tenga la sesión iniciada.`,
          { duration: 12000 }
        );
      }
      setVersionPiezas((v) => v + 1);
      await fetchModelos();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo traer");
    } finally {
      setTrayendo(false);
    }
  };

  /* ─── Render ──────────────────────────────────────── */

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-bold">Productos</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={traerDeBodega} disabled={trayendo} title="Trae ya las piezas nuevas que Bodega haya subido">
            {trayendo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Traer de Bodega
          </Button>
          <Button onClick={() => setNuevo({ nombre: "", serie: "" })}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo producto
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="space-y-2">
        {/* Row 1: search + sort + view toggle */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar producto o serie..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Sort */}
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="h-9 rounded-md border border-input bg-background px-3 pr-8 text-sm appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring min-w-[170px]"
            >
              <option value="nuevo">⬇ Más reciente</option>
              <option value="antiguo">⬆ Más antiguo</option>
              <option value="az">A → Z</option>
              <option value="za">Z → A</option>
            </select>
            <ArrowUpDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          </div>

          {/* Estado filter */}
          <div className="inline-flex rounded-md border text-sm overflow-hidden">
            {(["todos", "activos", "inactivos", "insumos"] as const).map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setFilterEstado(e)}
                className={`px-3 h-9 capitalize transition-colors ${
                  filterEstado === e
                    ? "bg-primary text-primary-foreground"
                    : "bg-background hover:bg-muted"
                } ${e !== "todos" ? "border-l" : ""}`}
              >
                {e}
              </button>
            ))}
          </div>

          {/* Mostrar consolidados toggle */}
          <Button
            variant={mostrarConsolidados ? "default" : "outline"}
            size="sm"
            className="gap-1.5 h-9"
            onClick={() => setMostrarConsolidados(!mostrarConsolidados)}
            type="button"
            title="Mostrar productos que fueron consolidados en otro"
          >
            <Combine className="h-3.5 w-3.5" />
            {mostrarConsolidados ? "Ocultar consolidados" : "Mostrar consolidados"}
          </Button>

          {/* Extra filters toggle */}
          <Button
            variant={showExtraFilters ? "default" : "outline"}
            size="sm"
            className="gap-1.5 h-9"
            onClick={() => setShowExtraFilters(!showExtraFilters)}
            type="button"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filtros
            {(filterExtras.con3mf || filterExtras.conImagen || filterExtras.conVariantes) && (
              <span className="ml-0.5 h-2 w-2 rounded-full bg-primary-foreground" />
            )}
          </Button>

          {/* View mode */}
          <div className="inline-flex rounded-md border ml-auto">
            <Button
              variant={viewMode === "table" ? "default" : "ghost"}
              size="icon"
              className="rounded-r-none h-9 w-9"
              onClick={() => setViewMode("table")}
              title="Vista tabla"
            >
              <TableIcon className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "cards" ? "default" : "ghost"}
              size="icon"
              className="rounded-l-none h-9 w-9"
              onClick={() => setViewMode("cards")}
              title="Vista tarjetas"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Row 2: category filter + extra filters (collapsible) */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="w-56">
            <CategoryFilter
              categorias={categorias}
              selected={filterCategoriaIds}
              onChange={setFilterCategoriaIds}
            />
          </div>

          {showExtraFilters && (
            <div className="flex flex-wrap gap-3 items-center">
              {([
                { key: "con3mf", label: "Con archivo 3MF" },
                { key: "conImagen", label: "Con imagen" },
                { key: "conVariantes", label: "Con variantes" },
              ] as const).map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={filterExtras[key]}
                    onChange={() => setFilterExtras(prev => ({ ...prev, [key]: !prev[key] }))}
                    className="h-4 w-4 rounded border-input accent-primary"
                  />
                  {label}
                </label>
              ))}
              {(filterExtras.con3mf || filterExtras.conImagen || filterExtras.conVariantes) && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                  onClick={() => setFilterExtras({ con3mf: false, conImagen: false, conVariantes: false })}
                >
                  Limpiar
                </button>
              )}
            </div>
          )}

          {/* SKU filter + counter */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">SKU:</span>
            <div className="inline-flex rounded-md border text-xs overflow-hidden">
              {(["todos", "con", "sin"] as const).map((e, i) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setFilterSku(e)}
                  className={`px-2.5 py-1 capitalize transition-colors ${
                    filterSku === e
                      ? "bg-primary text-primary-foreground"
                      : "bg-background hover:bg-muted"
                  } ${i > 0 ? "border-l" : ""}`}
                >
                  {e === "todos" ? "Todos" : e === "con" ? "Con SKU" : "Sin SKU"}
                </button>
              ))}
            </div>
            {(() => {
              const total = modelos.filter((m) => m.activo && !m.consolidadoEnId && !m.esInsumo).length;
              const conSku = modelos.filter((m) => m.activo && !m.consolidadoEnId && !m.esInsumo && m.sku).length;
              const sinSku = total - conSku;
              return (
                <button
                  type="button"
                  onClick={() => setFilterSku(sinSku > 0 ? "sin" : "todos")}
                  className={`text-xs hover:underline decoration-dotted underline-offset-4 ${
                    sinSku > 0 ? "text-amber-500" : "text-muted-foreground"
                  }`}
                  title={sinSku > 0 ? "Click para ver los que faltan" : "Todos los productos tienen SKU"}
                >
                  {conSku}/{total} con SKU
                </button>
              );
            })()}
          </div>

          {/* Dónde está publicado */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Mercado Libre:</span>
            <div className="inline-flex rounded-md border text-xs overflow-hidden">
              {([["todos", "Todos"], ["publicados", "Publicados"], ["pausados", "Pausados"], ["sin", "Sin publicar"]] as const).map(([v, t], i) => (
                <button key={v} type="button" onClick={() => setFilterMl(v)} className={`px-2.5 py-1 transition-colors ${filterMl === v ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"} ${i > 0 ? "border-l" : ""}`}>
                  {t}
                </button>
              ))}
            </div>
            <span className="text-xs text-muted-foreground">Web:</span>
            <div className="inline-flex rounded-md border text-xs overflow-hidden">
              {([["todos", "Todos"], ["si", "En la web"], ["no", "No está"]] as const).map(([v, t], i) => (
                <button key={v} type="button" onClick={() => setFilterWeb(v)} className={`px-2.5 py-1 transition-colors ${filterWeb === v ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"} ${i > 0 ? "border-l" : ""}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Results count */}
          <span className="text-xs text-muted-foreground ml-auto">
            {filtered.length} producto{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Piezas de Bodega que no entraron solas (docs/sdd/004, spec 005) */}
      <PiezasNuevas key={versionPiezas} onCambio={fetchModelos} />

      {/* Lo que se hace en cantidad: tildar productos en la tabla */}
      {elegidos.size > 0 && (
        <Card className="flex flex-wrap items-center gap-2 p-3 border-primary/40 sticky top-2 z-10">
          <span className="text-sm font-medium">
            {elegidos.size} {elegidos.size === 1 ? "producto elegido" : "productos elegidos"}
          </span>
          <Button size="sm" onClick={() => setMasivo("crear")} disabled={!itemsACrear.length} title={!itemsACrear.length ? "Todos ya están publicados en ML" : undefined}>
            Crear en ML ({itemsACrear.length})
          </Button>
          <Button size="sm" variant="outline" onClick={() => setMasivo("inmediata")} disabled={!mlasElegidas.length} title="En ML: sin tiempo de disponibilidad y con Flex">
            Con stock: Flex ({mlasElegidas.length})
          </Button>
          <Button size="sm" variant="outline" onClick={() => setMasivo("a_pedido")} disabled={!mlasElegidas.length} title="En ML: sin Flex y con días de disponibilidad">
            Sin stock: a pedido ({mlasElegidas.length})
          </Button>
          <Button size="sm" variant="outline" onClick={() => setMasivo("activar")}>
            Activar
          </Button>
          <Button size="sm" variant="outline" onClick={() => setMasivo("desactivar")}>
            Desactivar
          </Button>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setElegidos(new Set())}>
            Limpiar
          </Button>
        </Card>
      )}

      {/* Content */}
      {filtered.length === 0 ? (
        modelos.length === 0 ? (
          <EmptyState
            icon={Box}
            title="Sin productos registrados"
            description="Creá la pieza en Bodega y aparece acá sola, o creá el producto a mano."
            actionLabel="Nuevo producto"
            onAction={() => setNuevo({ nombre: "", serie: "" })}
          />
        ) : (
          <EmptyState
            icon={Search}
            title="Sin resultados"
            description="No se encontraron productos con esos filtros."
          />
        )
      ) : viewMode === "cards" ? (
        /* ─── Card View ─────────────────────────────── */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((m) => (
            <Card
              key={m.id}
              className="cursor-pointer overflow-hidden transition-shadow hover:shadow-lg"
              onClick={() => router.push(`/modelos/${m.id}`)}
            >
              {/* Image */}
              <div className="relative aspect-square w-full bg-muted">
                {m.imagenUrl ? (
                  <img
                    src={m.imagenUrl}
                    alt={m.nombre}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <FileBox className="h-12 w-12 text-muted-foreground/40" />
                  </div>
                )}
                {/* Active badge */}
                {!m.activo && (
                  <Badge variant="destructive" className="absolute top-2 right-2">
                    Inactivo
                  </Badge>
                )}
              </div>
              {/* Info */}
              <div className="space-y-2 px-4 pb-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold truncate" title={m.nombre}>
                    {m.nombre}
                  </h3>
                  {!m.sku && !m.consolidadoEn && !m.esInsumo && (
                    <Badge variant="outline" className="border-amber-500/40 text-amber-500 text-[10px] py-0 px-1.5 shrink-0">
                      Sin SKU
                    </Badge>
                  )}
                </div>
                <EstadoMl c={canales[m.id]} />
                <CategoriaBadges categorias={m.categorias} />
                {m.consolidadoEn && (
                  <p className="text-xs text-amber-500 truncate">
                    ↪ Consolidado en {m.consolidadoEn.nombre}
                  </p>
                )}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div>
        <div className="hidden md:block rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <input
                    type="checkbox"
                    aria-label="Elegir todos"
                    checked={filtered.length > 0 && filtered.every((m) => elegidos.has(m.id))}
                    onChange={(e) => setElegidos(e.target.checked ? new Set(filtered.map((m) => m.id)) : new Set())}
                  />
                </TableHead>
                <TableHead className="w-[60px]">Imagen</TableHead>
                <TableHead className="min-w-[140px]">Nombre</TableHead>
                <TableHead>Categorías</TableHead>
                <TableHead className="text-right">Costo</TableHead>
                <TableHead>Mercado Libre</TableHead>
                <TableHead>Web</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((m) => {
                return (
                  <TableRow
                    key={m.id}
                    className={`cursor-pointer hover:bg-muted/50 ${elegidos.has(m.id) ? "bg-primary/5" : ""}`}
                    onClick={() => router.push(`/modelos/${m.id}`)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Elegir ${m.nombre}`}
                        checked={elegidos.has(m.id)}
                        onChange={(e) =>
                          setElegidos((prev) => {
                            const s = new Set(prev);
                            if (e.target.checked) s.add(m.id);
                            else s.delete(m.id);
                            return s;
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      {m.imagenUrl ? (
                        <img
                          src={m.imagenUrl}
                          alt={m.nombre}
                          className="h-10 w-10 rounded object-cover"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                          <FileBox className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{m.nombre}</span>
                          {!m.sku && !m.consolidadoEn && !m.esInsumo && (
                            <Badge variant="outline" className="border-amber-500/40 text-amber-500 text-[10px] py-0 px-1.5">
                              Sin SKU
                            </Badge>
                          )}
                          {m.sku && (
                            <code className="text-[10px] text-muted-foreground font-mono">{m.sku}</code>
                          )}
                        </div>
                        {m.serie && (
                          <span className="block text-xs text-muted-foreground">{m.serie}</span>
                        )}
                        {m.consolidadoEn && (
                          <span className="block text-xs text-amber-500 mt-0.5">
                            ↪ Consolidado en {m.consolidadoEn.nombre}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <CategoriaBadges categorias={m.categorias} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPrice(costoModelo(m))}
                      {m.costoInsumos > 0 && (
                        <div className="text-[10px] text-muted-foreground">
                          {formatPrice(m.costoFab)} + {formatPrice(m.costoInsumos)} insumos
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <EstadoMl c={canales[m.id]} />
                    </TableCell>
                    <TableCell className="text-xs">
                      {(canales[m.id]?.web ?? 0) > 0 ? <span>En la web</span> : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={m.activo ? "default" : "destructive"}>
                        {m.activo ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        {/* Mobile fallback: show cards when table mode on small screens */}
        <div className="md:hidden grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filtered.map((m) => (
            <Card
              key={m.id}
              className="cursor-pointer overflow-hidden transition-shadow hover:shadow-lg"
              onClick={() => router.push(`/modelos/${m.id}`)}
            >
              <div className="relative aspect-square w-full bg-muted">
                {m.imagenUrl ? (
                  <img src={m.imagenUrl} alt={m.nombre} className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center">
                    <FileBox className="h-12 w-12 text-muted-foreground/30" />
                  </div>
                )}
                {!m.activo && (
                  <Badge variant="destructive" className="absolute top-2 right-2 text-[10px]">Inactivo</Badge>
                )}
              </div>
              <div className="p-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-medium text-sm truncate">{m.nombre}</h3>
                  {!m.sku && !m.consolidadoEn && !m.esInsumo && (
                    <Badge variant="outline" className="border-amber-500/40 text-amber-500 text-[10px] py-0 px-1 shrink-0">
                      Sin SKU
                    </Badge>
                  )}
                </div>
                <EstadoMl c={canales[m.id]} />
                <CategoriaBadges categorias={m.categorias} />
                {m.consolidadoEn && (
                  <p className="text-xs text-amber-500 truncate">
                    ↪ {m.consolidadoEn.nombre}
                  </p>
                )}
              </div>
            </Card>
          ))}
        </div>
        </div>
      )}

      {/* ─── En cantidad ────────────────────────────── */}
      <Dialog open={masivo === "crear"} onOpenChange={(o) => !o && setMasivo(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Crear en Mercado Libre ({itemsACrear.length})</DialogTitle>
            <DialogDescription>Las combinaciones sin publicar de los productos elegidos. No se crea nada hasta que confirmes; quedan pausadas.</DialogDescription>
          </DialogHeader>
          {masivo === "crear" && (
            <CrearMlMasivo
              items={itemsACrear}
              onCerrar={() => setMasivo(null)}
              onHecho={() => {
                setElegidos(new Set());
                fetchModelos();
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={masivo === "inmediata" || masivo === "a_pedido"} onOpenChange={(o) => !o && setMasivo(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {masivo === "inmediata" ? "Entrega inmediata con Flex" : "A pedido, sin Flex"}: {mlasElegidas.length} {mlasElegidas.length === 1 ? "publicación" : "publicaciones"}
            </DialogTitle>
            <DialogDescription>Las publicaciones de ML de los productos elegidos, como están hoy. No se manda nada hasta que confirmes.</DialogDescription>
          </DialogHeader>
          {(masivo === "inmediata" || masivo === "a_pedido") && (
            <ConfirmarFlex mlas={mlasElegidas} inmediata={masivo === "inmediata"} onCerrar={() => setMasivo(null)} onHecho={fetchModelos} />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={masivo === "activar" || masivo === "desactivar"} onOpenChange={(o) => !o && !aplicandoMasivo && setMasivo(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {masivo === "activar" ? "Activar" : "Desactivar"} {elegidos.size} {elegidos.size === 1 ? "producto" : "productos"}
            </DialogTitle>
            <DialogDescription>
              {masivo === "desactivar"
                ? "Un producto inactivo no aparece para vender en el ERP ni en Precios. No toca sus publicaciones de ML ni de la web."
                : "Vuelven a aparecer para vender en el ERP y en Precios."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMasivo(null)} disabled={aplicandoMasivo}>
              Cancelar
            </Button>
            <Button onClick={cambiarActivo} disabled={aplicandoMasivo}>
              {aplicandoMasivo ? "Guardando…" : masivo === "activar" ? "Activar" : "Desactivar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Nuevo producto ─────────────────────────── */}
      <Dialog open={!!nuevo} onOpenChange={(o) => !o && setNuevo(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nuevo producto</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              crearProducto();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="np-nombre">Nombre</Label>
              <Input id="np-nombre" autoFocus value={nuevo?.nombre ?? ""} onChange={(e) => setNuevo((n) => (n ? { ...n, nombre: e.target.value } : n))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="np-serie">Serie <span className="text-xs text-muted-foreground font-normal">(opcional)</span></Label>
              <Input id="np-serie" value={nuevo?.serie ?? ""} placeholder="Demon Slayer, One Piece…" onChange={(e) => setNuevo((n) => (n ? { ...n, serie: e.target.value } : n))} />
            </div>
            <p className="text-xs text-muted-foreground">
              Lo demás (precio, fotos, variantes, pieza de Bodega) se completa en su página. Si la pieza ya está en Bodega, no hace falta: el producto aparece solo.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setNuevo(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={creando || !nuevo?.nombre.trim()}>
                {creando ? "Creando…" : "Crear y abrir"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
