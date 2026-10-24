"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  Plus, Search, FileBox, LayoutGrid, TableIcon, ChevronDown, SlidersHorizontal, ArrowUpDown, Box, Combine,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { TableSkeleton } from "@/components/data-loading";
import { EmptyState } from "@/components/empty-state";
import { PiezasNuevas } from "@/components/producto/piezas-nuevas";
import { costoModelo } from "@/lib/costos";

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
  const [sortBy, setSortBy] = useState<"nuevo" | "antiguo" | "az" | "za" | "precioAsc" | "precioDesc" | "margen">("nuevo");
  const [showExtraFilters, setShowExtraFilters] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  // "Nuevo producto": sólo el nombre; el resto se completa en su página (docs/sdd/004, spec 001).
  const [nuevo, setNuevo] = useState<{ nombre: string; serie: string } | null>(null);
  const [creando, setCreando] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [mostrarConsolidados, setMostrarConsolidados] = useState(false);
  const [filterSku, setFilterSku] = useState<"todos" | "con" | "sin">("todos");

  /* ─── Fetch ───────────────────────────────────────── */

  const fetchModelos = useCallback(async () => {
    const consolidados = mostrarConsolidados ? "incluir" : "ocultar";
    const res = await fetch(`/api/modelos?consolidados=${consolidados}`);
    setModelos(await res.json());
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
      return matchSearch && matchCategoria && matchEstado && match3mf && matchImagen && matchVariantes && matchSku;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "az": return a.nombre.localeCompare(b.nombre, "es");
        case "za": return b.nombre.localeCompare(a.nombre, "es");
        case "precioAsc": return a.precioVenta - b.precioVenta;
        case "precioDesc": return b.precioVenta - a.precioVenta;
        case "margen":
          return (b.precioVenta - costoModelo(b)) - (a.precioVenta - costoModelo(a));
        case "antiguo": return new Date(a.creadoEn).getTime() - new Date(b.creadoEn).getTime();
        default: return new Date(b.creadoEn).getTime() - new Date(a.creadoEn).getTime();
      }
    });

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

  /* ─── Render ──────────────────────────────────────── */

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Productos</h1>
        <Button onClick={() => setNuevo({ nombre: "", serie: "" })}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo producto
        </Button>
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
              <option value="precioAsc">Precio: menor a mayor</option>
              <option value="precioDesc">Precio: mayor a menor</option>
              <option value="margen">Mayor margen</option>
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

          {/* Results count */}
          <span className="text-xs text-muted-foreground ml-auto">
            {filtered.length} producto{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Piezas de Bodega que no entraron solas (docs/sdd/004, spec 005) */}
      <PiezasNuevas onCambio={fetchModelos} />

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
                <p className="text-lg font-bold text-primary">
                  {formatPrice(m.precioVenta)}
                </p>
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
                <TableHead className="w-[60px]">Imagen</TableHead>
                <TableHead className="min-w-[140px]">Nombre</TableHead>
                <TableHead>Categorías</TableHead>
                <TableHead className="text-right">Costo Fab</TableHead>
                <TableHead className="text-right">Precio Venta</TableHead>
                <TableHead className="text-right">Precio Crédito</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((m) => {
                const precioCredito = m.precioVenta * (1 + m.precioCreditoPorc / 100);
                return (
                  <TableRow
                    key={m.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => router.push(`/modelos/${m.id}`)}
                  >
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
                    <TableCell className="text-right tabular-nums font-medium">{formatPrice(m.precioVenta)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatPrice(precioCredito)}</TableCell>
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
                <p className="text-lg font-bold text-primary">{formatPrice(m.precioVenta)}</p>
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
