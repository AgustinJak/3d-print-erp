"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Plus, Search, Pencil, Trash2, FileBox, Download, ChevronRight } from "lucide-react";
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
import { FileUpload } from "@/components/file-upload";

interface Producto {
  id: string;
  nombre: string;
}

interface Modelo {
  id: string;
  productoId: string;
  nombre: string;
  serie: string | null;
  pesoGr: number | null;
  notas: string | null;
  archivo3mfUrl: string | null;
  imagenUrl: string | null;
  producto: { id: string; nombre: string };
}

const emptyForm = {
  productoId: "",
  nombre: "",
  serie: "",
  pesoGr: "",
  notas: "",
  archivo3mfUrl: "",
  imagenUrl: "",
};

export default function ModelosPage() {
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [search, setSearch] = useState("");
  const [filterProducto, setFilterProducto] = useState<string>("todos");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchModelos = useCallback(async () => {
    const res = await fetch("/api/modelos");
    setModelos(await res.json());
  }, []);

  const fetchProductos = useCallback(async () => {
    const res = await fetch("/api/productos");
    const data = await res.json();
    setProductos(data.map((p: Producto & { _count?: unknown }) => ({ id: p.id, nombre: p.nombre })));
  }, []);

  useEffect(() => {
    Promise.all([fetchModelos(), fetchProductos()]).then(() => setInitialLoading(false));
  }, [fetchModelos, fetchProductos]);

  if (initialLoading) return <TableSkeleton cols={6} />;

  const filtered = modelos.filter((m) => {
    const matchSearch =
      m.nombre.toLowerCase().includes(search.toLowerCase()) ||
      m.serie?.toLowerCase().includes(search.toLowerCase()) ||
      m.producto.nombre.toLowerCase().includes(search.toLowerCase());
    const matchProducto = filterProducto === "todos" || m.productoId === filterProducto;
    return matchSearch && matchProducto;
  });

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (m: Modelo) => {
    setEditingId(m.id);
    setForm({
      productoId: m.productoId,
      nombre: m.nombre,
      serie: m.serie || "",
      pesoGr: m.pesoGr?.toString() || "",
      notas: m.notas || "",
      archivo3mfUrl: m.archivo3mfUrl || "",
      imagenUrl: m.imagenUrl || "",
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
      body: JSON.stringify(form),
    });
    setDialogOpen(false);
    setLoading(false);
    fetchModelos();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este modelo?")) return;
    await fetch(`/api/modelos/${id}`, { method: "DELETE" });
    fetchModelos();
  };

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Modelos</h1>
        <Button onClick={openCreate} disabled={productos.length === 0}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Modelo
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar modelo, serie o producto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterProducto} onValueChange={(v) => setFilterProducto(v ?? "todos")}>
          <SelectTrigger>
            <span className="truncate">{filterProducto === "todos" ? "Todos los productos" : productos.find(p => p.id === filterProducto)?.nombre ?? "..."}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los productos</SelectItem>
            {productos.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[120px]">Nombre</TableHead>
              <TableHead className="min-w-[120px]">Producto</TableHead>
              <TableHead>Serie</TableHead>
              <TableHead>Peso</TableHead>
              <TableHead>Archivo 3MF</TableHead>
              <TableHead className="w-[100px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  {modelos.length === 0
                    ? productos.length === 0
                      ? "Primero creá un producto."
                      : "No hay modelos registrados."
                    : "Sin resultados."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((m) => (
                <React.Fragment key={m.id}>
                  <TableRow
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setExpandedId(expandedId === m.id ? null : m.id)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${expandedId === m.id ? "rotate-90" : ""}`} />
                        {m.imagenUrl ? (
                          <img src={m.imagenUrl} alt={m.nombre} className="h-10 w-10 rounded object-cover" />
                        ) : (
                          <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                            <FileBox className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                        <span className="font-medium">{m.nombre}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{m.producto.nombre}</Badge>
                    </TableCell>
                    <TableCell>{m.serie || "—"}</TableCell>
                    <TableCell>{m.pesoGr ? `${m.pesoGr} g` : "—"}</TableCell>
                    <TableCell>
                      {m.archivo3mfUrl ? (
                        <a
                          href={m.archivo3mfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-violet-500 hover:text-violet-400"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Download className="h-3.5 w-3.5" />
                          Descargar
                        </a>
                      ) : (
                        <span className="text-muted-foreground text-sm">No</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openEdit(m); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleDelete(m.id); }}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {expandedId === m.id && (
                    <TableRow>
                      <TableCell colSpan={6} className="bg-muted/30 p-4">
                        <div className="space-y-3">
                          <div>
                            <span className="text-sm font-medium">Notas</span>
                            {m.notas ? (
                              <p className="text-sm">{m.notas}</p>
                            ) : (
                              <p className="text-sm text-muted-foreground">Sin notas</p>
                            )}
                          </div>
                          {m.imagenUrl && (
                            <div>
                              <span className="text-sm font-medium">Vista previa</span>
                              <img src={m.imagenUrl} alt={m.nombre} className="mt-1 h-32 w-32 rounded object-cover" />
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Modelo" : "Nuevo Modelo"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Producto *</Label>
              <Select value={form.productoId || "placeholder"} onValueChange={(v) => updateField("productoId", v === "placeholder" ? "" : (v ?? ""))} required>
                <SelectTrigger>
                  <span className="truncate">{form.productoId ? productos.find(p => p.id === form.productoId)?.nombre ?? "..." : "Seleccionar producto"}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="placeholder" disabled>Seleccionar producto</SelectItem>
                  {productos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre del modelo *</Label>
              <Input id="nombre" value={form.nombre} onChange={(e) => updateField("nombre", e.target.value)} required />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="serie">Serie / Franquicia</Label>
                <Input id="serie" value={form.serie} onChange={(e) => updateField("serie", e.target.value)} placeholder="Ej: One Piece, Naruto..." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pesoGr">Peso (g)</Label>
                <Input id="pesoGr" type="number" step="0.1" value={form.pesoGr} onChange={(e) => updateField("pesoGr", e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notas">Notas</Label>
              <Textarea id="notas" value={form.notas} onChange={(e) => updateField("notas", e.target.value)} rows={2} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <div className="space-y-2">
                <Label>Imagen de referencia</Label>
                <FileUpload
                  bucket="imagenes"
                  accept=".jpg,.jpeg,.png,.webp"
                  currentUrl={form.imagenUrl || null}
                  onUploaded={(url) => updateField("imagenUrl", url)}
                  onRemoved={() => updateField("imagenUrl", "")}
                  label="Subir imagen"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={loading || !form.productoId}>{loading ? "Guardando..." : "Guardar"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
