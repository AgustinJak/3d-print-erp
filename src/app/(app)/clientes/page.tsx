"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  Plus, Search, Pencil, Trash2, ChevronRight, User, MapPin, FileText,
  Filter, ArrowUpDown, DollarSign, ShoppingCart, Users,
} from "lucide-react";
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/data-loading";
import { EmptyState } from "@/components/empty-state";
import { PLATAFORMAS_CLIENTE, TIPOS_CLIENTE } from "@/lib/constants";

interface Cliente {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  notas: string | null;
  plataforma: string | null;
  tipoCliente: string | null;
  creadoEn: string;
  totalGastado: number;
  pedidosCount: number;
}

const emptyForm = {
  nombre: "",
  telefono: "",
  email: "",
  direccion: "",
  notas: "",
  plataforma: "",
  tipoCliente: "",
};

function formatMoney(n: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function ClientesPage() {
  const router = useRouter();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Filters
  const [filterPlataforma, setFilterPlataforma] = useState("todos");
  const [filterTipo, setFilterTipo] = useState("todos");
  const [sortBy, setSortBy] = useState("reciente");

  const fetchClientes = useCallback(async () => {
    const res = await fetch("/api/clientes");
    const data = await res.json();
    setClientes(data);
    setInitialLoading(false);
  }, []);

  useEffect(() => {
    fetchClientes();
  }, [fetchClientes]);

  const filtered = useMemo(() => {
    let result = clientes.filter((c) =>
      c.nombre.toLowerCase().includes(search.toLowerCase()) ||
      c.email?.toLowerCase().includes(search.toLowerCase()) ||
      c.telefono?.includes(search)
    );

    if (filterPlataforma !== "todos") {
      result = result.filter((c) => c.plataforma === filterPlataforma);
    }
    if (filterTipo !== "todos") {
      result = result.filter((c) => c.tipoCliente === filterTipo);
    }

    switch (sortBy) {
      case "a-z":
        result.sort((a, b) => a.nombre.localeCompare(b.nombre));
        break;
      case "z-a":
        result.sort((a, b) => b.nombre.localeCompare(a.nombre));
        break;
      case "mas-gastado":
        result.sort((a, b) => b.totalGastado - a.totalGastado);
        break;
      case "mas-pedidos":
        result.sort((a, b) => b.pedidosCount - a.pedidosCount);
        break;
      case "antiguo":
        result.sort((a, b) => new Date(a.creadoEn).getTime() - new Date(b.creadoEn).getTime());
        break;
      default: // reciente
        result.sort((a, b) => new Date(b.creadoEn).getTime() - new Date(a.creadoEn).getTime());
        break;
    }

    return result;
  }, [clientes, search, filterPlataforma, filterTipo, sortBy]);

  if (initialLoading) return <TableSkeleton cols={5} />;

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (cliente: Cliente) => {
    setEditingId(cliente.id);
    setForm({
      nombre: cliente.nombre,
      telefono: cliente.telefono || "",
      email: cliente.email || "",
      direccion: cliente.direccion || "",
      notas: cliente.notas || "",
      plataforma: cliente.plataforma || "",
      tipoCliente: cliente.tipoCliente || "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (editingId) {
      await fetch(`/api/clientes/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    } else {
      await fetch("/api/clientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    }

    setDialogOpen(false);
    setLoading(false);
    toast.success(editingId ? "Cliente actualizado" : "Cliente creado");
    fetchClientes();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar este cliente?")) return;
    await fetch(`/api/clientes/${id}`, { method: "DELETE" });
    toast.success("Cliente eliminado");
    fetchClientes();
  };

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const hasActiveFilters = filterPlataforma !== "todos" || filterTipo !== "todos";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Clientes</h1>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Cliente
        </Button>
      </div>

      {/* Search + Sort + Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, email o teléfono..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={sortBy} onValueChange={(v) => v && setSortBy(v)}>
          <SelectTrigger className="w-[170px]">
            <ArrowUpDown className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="reciente">Más reciente</SelectItem>
            <SelectItem value="antiguo">Más antiguo</SelectItem>
            <SelectItem value="a-z">A → Z</SelectItem>
            <SelectItem value="z-a">Z → A</SelectItem>
            <SelectItem value="mas-gastado">Mayor gasto</SelectItem>
            <SelectItem value="mas-pedidos">Más pedidos</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterPlataforma} onValueChange={(v) => v && setFilterPlataforma(v)}>
          <SelectTrigger className="w-[160px]">
            <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="Plataforma" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas las plataformas</SelectItem>
            {PLATAFORMAS_CLIENTE.map((p) => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterTipo} onValueChange={(v) => v && setFilterTipo(v)}>
          <SelectTrigger className="w-[150px]">
            <User className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los tipos</SelectItem>
            {TIPOS_CLIENTE.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setFilterPlataforma("todos"); setFilterTipo("todos"); }}
          >
            Limpiar filtros
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {filtered.length} de {clientes.length} clientes
      </p>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[140px]">Nombre</TableHead>
              <TableHead>Etiquetas</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="text-right">Gastado</TableHead>
              <TableHead className="text-right">Pedidos</TableHead>
              <TableHead className="w-[100px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-0">
                  {clientes.length === 0 ? (
                    <EmptyState
                      icon={Users}
                      title="Sin clientes registrados"
                      description="Agrega tu primer cliente para asociarlo a pedidos y ver su historial de compras."
                      actionLabel="Agregar cliente"
                      onAction={openCreate}
                    />
                  ) : (
                    <EmptyState
                      icon={Search}
                      title="Sin resultados"
                      description="No se encontraron clientes con esa busqueda."
                    />
                  )}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((cliente) => {
                const plataformaLabel = PLATAFORMAS_CLIENTE.find(
                  (p) => p.value === cliente.plataforma
                )?.label;
                const tipoLabel = TIPOS_CLIENTE.find(
                  (t) => t.value === cliente.tipoCliente
                )?.label;

                return (
                  <TableRow
                    key={cliente.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => router.push(`/clientes/${cliente.id}`)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        {cliente.nombre}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {plataformaLabel && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-blue-500/10 text-blue-600 border-blue-300">
                            {plataformaLabel}
                          </Badge>
                        )}
                        {tipoLabel && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-purple-500/10 text-purple-600 border-purple-300">
                            {tipoLabel}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{cliente.telefono || "—"}</TableCell>
                    <TableCell className="text-sm">{cliente.email || "—"}</TableCell>
                    <TableCell className="text-right text-sm font-medium">
                      {cliente.totalGastado > 0 ? formatMoney(cliente.totalGastado) : "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {cliente.pedidosCount || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => { e.stopPropagation(); openEdit(cliente); }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => { e.stopPropagation(); handleDelete(cliente.id); }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Editar Cliente" : "Nuevo Cliente"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <User className="h-4 w-4" />
                Datos personales
              </h4>
              <div className="space-y-2">
                <Label htmlFor="nombre">Nombre <span className="text-destructive">*</span></Label>
                <Input
                  id="nombre"
                  value={form.nombre}
                  onChange={(e) => updateField("nombre", e.target.value)}
                  required
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="telefono">Teléfono</Label>
                  <Input
                    id="telefono"
                    value={form.telefono}
                    onChange={(e) => updateField("telefono", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => updateField("email", e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Tags */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <ShoppingCart className="h-4 w-4" />
                Clasificación
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Plataforma</Label>
                  <Select value={form.plataforma} onValueChange={(v) => updateField("plataforma", v ?? "")}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Sin plataforma</SelectItem>
                      {PLATAFORMAS_CLIENTE.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tipo de cliente</Label>
                  <Select value={form.tipoCliente} onValueChange={(v) => updateField("tipoCliente", v ?? "")}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Sin tipo</SelectItem>
                      {TIPOS_CLIENTE.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Ubicación
              </h4>
              <div className="space-y-2">
                <Label htmlFor="direccion">Dirección</Label>
                <Input
                  id="direccion"
                  value={form.direccion}
                  onChange={(e) => updateField("direccion", e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Notas
              </h4>
              <div className="space-y-2">
                <Textarea
                  id="notas"
                  value={form.notas}
                  onChange={(e) => updateField("notas", e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
