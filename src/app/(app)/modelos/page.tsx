"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  Plus, Search, Pencil, Trash2, FileBox, Download,
  LayoutGrid, TableIcon, ChevronDown, X, ImagePlus, SlidersHorizontal, ArrowUpDown, Box,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { TableSkeleton } from "@/components/data-loading";
import { EmptyState } from "@/components/empty-state";
import { FileUpload } from "@/components/file-upload";

/* ─── Types ────────────────────────────────────────────── */

interface Categoria {
  id: string;
  nombre: string;
  color: string | null;
}

interface Variante {
  nombre: string;
  precioAdicional: number;
  costoFabAdicional: number;
  notas: string;
}

interface Modelo {
  id: string;
  nombre: string;
  serie: string | null;
  pesoGr: number | null;
  costoFab: number;
  precioVenta: number;
  precioCreditoPorc: number;
  precioMayorista: number | null;
  precioPromo: number | null;
  notas: string | null;
  archivo3mfUrl: string | null;
  imagenUrl: string | null;
  imagenesUrls: string[];
  activo: boolean;
  creadoEn: string;
  categorias: Array<{
    categoria: Categoria;
  }>;
  variantes: Variante[];
}

/* ─── Form ─────────────────────────────────────────────── */

const emptyForm = {
  nombre: "",
  serie: "",
  pesoGr: "",
  costoFab: "",
  precioVenta: "",
  precioCreditoPorc: "10",
  precioMayorista: "",
  precioPromo: "",
  notas: "",
  archivo3mfUrl: "",
  imagenUrl: "",
  imagenesUrls: [] as string[],
  activo: true,
  categoriaIds: [] as string[],
  variantes: [] as Variante[],
};

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

/* ─── Category Multi-Select for Form ───────────────────── */

function CategoryMultiSelect({
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

  const selectedCats = categorias.filter((c) => selected.includes(c.id));

  return (
    <div className="relative" ref={ref}>
      <div
        className="flex min-h-9 w-full cursor-pointer flex-wrap items-center gap-1 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
        onClick={() => setOpen(!open)}
      >
        {selectedCats.length === 0 && (
          <span className="text-muted-foreground">Seleccionar categorías...</span>
        )}
        {selectedCats.map((c) => (
          <Badge key={c.id} variant="secondary" className="gap-1">
            {c.color && (
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: c.color }}
              />
            )}
            {c.nombre}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); toggle(c.id); }}
              className="ml-0.5 hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover p-1 shadow-md max-h-48 overflow-y-auto">
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
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [search, setSearch] = useState("");
  const [filterCategoriaIds, setFilterCategoriaIds] = useState<string[]>([]);
  const [filterEstado, setFilterEstado] = useState<"todos" | "activos" | "inactivos">("activos");
  const [filterExtras, setFilterExtras] = useState<{ con3mf: boolean; conImagen: boolean; conVariantes: boolean }>({ con3mf: false, conImagen: false, conVariantes: false });
  const [sortBy, setSortBy] = useState<"nuevo" | "antiguo" | "az" | "za" | "precioAsc" | "precioDesc" | "margen">("nuevo");
  const [showExtraFilters, setShowExtraFilters] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  /* ─── Fetch ───────────────────────────────────────── */

  const fetchModelos = useCallback(async () => {
    const res = await fetch("/api/modelos");
    setModelos(await res.json());
  }, []);

  const fetchCategorias = useCallback(async () => {
    const res = await fetch("/api/categorias");
    setCategorias(await res.json());
  }, []);

  useEffect(() => {
    Promise.all([fetchModelos(), fetchCategorias()]).then(() => setInitialLoading(false));
  }, [fetchModelos, fetchCategorias]);

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
        filterEstado === "todos" ? true :
        filterEstado === "activos" ? m.activo :
        !m.activo;
      const match3mf = !filterExtras.con3mf || !!m.archivo3mfUrl;
      const matchImagen = !filterExtras.conImagen || !!m.imagenUrl;
      const matchVariantes = !filterExtras.conVariantes || (m.variantes && m.variantes.length > 0);
      return matchSearch && matchCategoria && matchEstado && match3mf && matchImagen && matchVariantes;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "az": return a.nombre.localeCompare(b.nombre, "es");
        case "za": return b.nombre.localeCompare(a.nombre, "es");
        case "precioAsc": return a.precioVenta - b.precioVenta;
        case "precioDesc": return b.precioVenta - a.precioVenta;
        case "margen": return (b.precioVenta - b.costoFab) - (a.precioVenta - a.costoFab);
        case "antiguo": return new Date(a.creadoEn).getTime() - new Date(b.creadoEn).getTime();
        default: return new Date(b.creadoEn).getTime() - new Date(a.creadoEn).getTime();
      }
    });

  /* ─── CRUD ────────────────────────────────────────── */

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (m: Modelo) => {
    setEditingId(m.id);
    setForm({
      nombre: m.nombre,
      serie: m.serie || "",
      pesoGr: m.pesoGr?.toString() || "",
      costoFab: m.costoFab.toString(),
      precioVenta: m.precioVenta.toString(),
      precioCreditoPorc: m.precioCreditoPorc.toString(),
      precioMayorista: m.precioMayorista?.toString() || "",
      precioPromo: m.precioPromo?.toString() || "",
      notas: m.notas || "",
      archivo3mfUrl: m.archivo3mfUrl || "",
      imagenUrl: m.imagenUrl || "",
      imagenesUrls: [
        ...(m.imagenUrl ? [m.imagenUrl] : []),
        ...((m.imagenesUrls || []).filter((u: string) => u !== m.imagenUrl)),
      ],
      activo: m.activo,
      categoriaIds: m.categorias.map(({ categoria }) => categoria.id),
      variantes: m.variantes?.map((v: Variante) => ({
        nombre: v.nombre,
        precioAdicional: v.precioAdicional || 0,
        costoFabAdicional: v.costoFabAdicional || 0,
        notas: v.notas || "",
      })) || [],
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const url = editingId ? `/api/modelos/${editingId}` : "/api/modelos";
    const method = editingId ? "PUT" : "POST";
    await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        imagenUrl: form.imagenesUrls[0] || "",
        imagenesUrls: form.imagenesUrls,
        pesoGr: form.pesoGr ? parseFloat(form.pesoGr) : null,
        costoFab: parseFloat(form.costoFab) || 0,
        precioVenta: parseFloat(form.precioVenta) || 0,
        precioCreditoPorc: parseFloat(form.precioCreditoPorc) || 10,
        precioMayorista: form.precioMayorista ? parseFloat(form.precioMayorista) : null,
        precioPromo: form.precioPromo ? parseFloat(form.precioPromo) : null,
      }),
    });
    setDialogOpen(false);
    setLoading(false);
    toast.success(editingId ? "Modelo actualizado" : "Modelo creado");
    fetchModelos();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este modelo?")) return;
    await fetch(`/api/modelos/${id}`, { method: "DELETE" });
    toast.success("Modelo eliminado");
    fetchModelos();
  };

  const updateField = (field: string, value: string | boolean | string[] | Variante[]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  /* ─── Render ──────────────────────────────────────── */

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Modelos</h1>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Modelo
        </Button>
      </div>

      {/* Toolbar */}
      <div className="space-y-2">
        {/* Row 1: search + sort + view toggle */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar modelo o serie..."
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
            {(["todos", "activos", "inactivos"] as const).map((e) => (
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

          {/* Results count */}
          <span className="text-xs text-muted-foreground ml-auto">
            {filtered.length} modelo{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
        modelos.length === 0 ? (
          <EmptyState
            icon={Box}
            title="Sin modelos registrados"
            description="Agrega tus modelos 3D para gestionar catálogo, precios y variantes."
            actionLabel="Nuevo Modelo"
            onAction={openCreate}
          />
        ) : (
          <EmptyState
            icon={Search}
            title="Sin resultados"
            description="No se encontraron modelos con esos filtros."
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
                <h3 className="font-semibold truncate" title={m.nombre}>
                  {m.nombre}
                </h3>
                <p className="text-lg font-bold text-primary">
                  {formatPrice(m.precioVenta)}
                </p>
                <CategoriaBadges categorias={m.categorias} />
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
                <TableHead className="w-[100px]">Acciones</TableHead>
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
                        <span className="font-medium">{m.nombre}</span>
                        {m.serie && (
                          <span className="block text-xs text-muted-foreground">{m.serie}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <CategoriaBadges categorias={m.categorias} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatPrice(m.costoFab)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{formatPrice(m.precioVenta)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatPrice(precioCredito)}</TableCell>
                    <TableCell>
                      <Badge variant={m.activo ? "default" : "destructive"}>
                        {m.activo ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => { e.stopPropagation(); openEdit(m); }}
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {m.archivo3mfUrl && (
                          <a
                            href={m.archivo3mfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            title="Descargar 3MF"
                          >
                            <Button variant="ghost" size="icon">
                              <Download className="h-4 w-4" />
                            </Button>
                          </a>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => { e.stopPropagation(); handleDelete(m.id); }}
                          title="Eliminar"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
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
                <h3 className="font-medium text-sm truncate">{m.nombre}</h3>
                <p className="text-lg font-bold text-primary">{formatPrice(m.precioVenta)}</p>
                <CategoriaBadges categorias={m.categorias} />
              </div>
            </Card>
          ))}
        </div>
        </div>
      )}

      {/* ─── Create / Edit Dialog ───────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Modelo" : "Nuevo Modelo"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Nombre */}
            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre *</Label>
              <Input
                id="nombre"
                value={form.nombre}
                onChange={(e) => updateField("nombre", e.target.value)}
                required
              />
            </div>

            {/* Serie + Peso */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="serie">Serie / Franquicia</Label>
                <Input
                  id="serie"
                  value={form.serie}
                  onChange={(e) => updateField("serie", e.target.value)}
                  placeholder="Ej: One Piece, Naruto..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pesoGr">Peso (g)</Label>
                <Input
                  id="pesoGr"
                  type="number"
                  step="0.1"
                  value={form.pesoGr}
                  onChange={(e) => updateField("pesoGr", e.target.value)}
                />
              </div>
            </div>

            {/* Costo Fab + Precio Venta */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="costoFab">Costo Fabricación *</Label>
                <Input
                  id="costoFab"
                  type="number"
                  step="0.01"
                  value={form.costoFab}
                  onChange={(e) => updateField("costoFab", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="precioVenta">Precio Venta *</Label>
                <Input
                  id="precioVenta"
                  type="number"
                  step="0.01"
                  value={form.precioVenta}
                  onChange={(e) => updateField("precioVenta", e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Crédito % + Mayorista */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="precioCreditoPorc">Recargo Crédito (%)</Label>
                <Input
                  id="precioCreditoPorc"
                  type="number"
                  step="0.1"
                  value={form.precioCreditoPorc}
                  onChange={(e) => updateField("precioCreditoPorc", e.target.value)}
                  placeholder="10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="precioMayorista">Precio Mayorista</Label>
                <Input
                  id="precioMayorista"
                  type="number"
                  step="0.01"
                  value={form.precioMayorista}
                  onChange={(e) => updateField("precioMayorista", e.target.value)}
                />
              </div>
            </div>

            {/* Precio Promo */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="precioPromo">Precio Promo</Label>
                <Input
                  id="precioPromo"
                  type="number"
                  step="0.01"
                  value={form.precioPromo}
                  onChange={(e) => updateField("precioPromo", e.target.value)}
                />
              </div>
            </div>

            {/* Categorías */}
            <div className="space-y-2">
              <Label>Categorías</Label>
              <CategoryMultiSelect
                categorias={categorias}
                selected={form.categoriaIds}
                onChange={(ids) => updateField("categoriaIds", ids)}
              />
            </div>

            {/* Variantes */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Variantes</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => updateField("variantes", [...(form.variantes || []), { nombre: "", precioAdicional: 0, costoFabAdicional: 0, notas: "" }])}
                >
                  <Plus className="mr-1 h-3 w-3" /> Agregar
                </Button>
              </div>
              {form.variantes && form.variantes.length > 0 ? (
                <div className="space-y-2">
                  {form.variantes.map((v: Variante, idx: number) => (
                    <div key={idx} className="flex items-start gap-2 rounded-md border bg-muted/30 p-2">
                      <div className="flex-1 space-y-1">
                        <Input
                          placeholder="Nombre variante"
                          value={v.nombre}
                          onChange={(e) => {
                            const updated = [...form.variantes];
                            updated[idx] = { ...updated[idx], nombre: e.target.value };
                            updateField("variantes", updated);
                          }}
                        />
                      </div>
                      <div className="w-24 space-y-1">
                        <Input
                          type="number"
                          step="1"
                          placeholder="+$ venta"
                          title="Precio adicional de venta"
                          value={v.precioAdicional || ""}
                          onChange={(e) => {
                            const updated = [...form.variantes];
                            updated[idx] = { ...updated[idx], precioAdicional: parseFloat(e.target.value) || 0 };
                            updateField("variantes", updated);
                          }}
                        />
                      </div>
                      <div className="w-24 space-y-1">
                        <Input
                          type="number"
                          step="1"
                          placeholder="+$ costo"
                          title="Costo de fabricación adicional"
                          value={v.costoFabAdicional || ""}
                          onChange={(e) => {
                            const updated = [...form.variantes];
                            updated[idx] = { ...updated[idx], costoFabAdicional: parseFloat(e.target.value) || 0 };
                            updateField("variantes", updated);
                          }}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => {
                          const updated = form.variantes.filter((_: Variante, i: number) => i !== idx);
                          updateField("variantes", updated);
                        }}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Sin variantes. Las variantes permiten agregar opciones como &quot;con llavero&quot;, &quot;reforzado&quot;, etc.</p>
              )}
            </div>

            {/* Notas */}
            <div className="space-y-2">
              <Label htmlFor="notas">Notas</Label>
              <Textarea
                id="notas"
                value={form.notas}
                onChange={(e) => updateField("notas", e.target.value)}
                rows={2}
              />
            </div>

            {/* File uploads */}
            <div className="space-y-4">
              {/* 3MF */}
              <div className="space-y-2">
                <Label>Archivo 3MF</Label>
                <FileUpload
                  bucket="modelos-3d"
                  accept=".3mf"
                  currentUrl={form.archivo3mfUrl || null}
                  onUploaded={(url) => updateField("archivo3mfUrl", url)}
                  onRemoved={() => updateField("archivo3mfUrl", "")}
                  label="Subir .3mf"
                />
              </div>

              {/* Multi-image up to 5 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>
                    Imágenes{" "}
                    <span className="text-muted-foreground font-normal">
                      ({form.imagenesUrls.length}/5) — la primera es la principal
                    </span>
                  </Label>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {Array.from({ length: 5 }).map((_, idx) => {
                    const url = form.imagenesUrls[idx];
                    return url ? (
                      /* Slot con imagen */
                      <div key={idx} className="relative group aspect-square rounded-lg overflow-hidden border bg-muted">
                        <img src={url} alt="" className="w-full h-full object-cover" />
                        {idx === 0 && (
                          <div className="absolute top-1 left-1 bg-primary text-primary-foreground text-[9px] px-1 rounded font-medium leading-4">
                            Principal
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            const updated = form.imagenesUrls.filter((_, i) => i !== idx);
                            updateField("imagenesUrls", updated);
                          }}
                          className="absolute top-1 right-1 h-5 w-5 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : form.imagenesUrls.length === idx ? (
                      /* Slot de upload (solo el siguiente disponible) */
                      <div key={idx} className="aspect-square">
                        <FileUpload
                          bucket="imagenes"
                          accept=".jpg,.jpeg,.png,.webp"
                          currentUrl={null}
                          onUploaded={(url) => {
                            const updated = [...form.imagenesUrls, url];
                            updateField("imagenesUrls", updated);
                          }}
                          label={idx === 0 ? "Principal" : `Foto ${idx + 1}`}
                          compact={false}
                          squareCompact
                        />
                      </div>
                    ) : (
                      /* Slot vacío bloqueado */
                      <div key={idx} className="aspect-square rounded-lg border-2 border-dashed border-muted flex items-center justify-center opacity-30">
                        <ImagePlus className="h-5 w-5 text-muted-foreground" />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Activo toggle */}
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <button
                type="button"
                role="switch"
                aria-checked={form.activo}
                onClick={() => updateField("activo", !form.activo)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors ${
                  form.activo ? "bg-primary" : "bg-muted-foreground/30"
                }`}
              >
                <span
                  className={`pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform ${
                    form.activo ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
              <span className="text-sm font-medium">Activo</span>
            </label>

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading || !form.nombre || !form.costoFab || !form.precioVenta}>
                {loading ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
