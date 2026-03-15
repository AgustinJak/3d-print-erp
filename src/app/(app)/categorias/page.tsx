"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Plus, Search, Pencil, Trash2, LayoutGrid, List, Tag, Box, Eye, EyeOff, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/data-loading";

interface Categoria {
  id: string;
  nombre: string;
  descripcion: string | null;
  color: string | null;
  activo: boolean;
  _count: { modelos: number };
  modeloImagenes: string[];
}

type ViewMode = "cards" | "table";

const emptyForm = {
  nombre: "",
  descripcion: "",
  color: "",
  activo: true,
};

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
];

export default function CategoriasPage() {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchCategorias = useCallback(async () => {
    const res = await fetch("/api/categorias");
    setCategorias(await res.json());
    setInitialLoading(false);
  }, []);

  useEffect(() => { fetchCategorias(); }, [fetchCategorias]);

  if (initialLoading) return <TableSkeleton cols={5} />;

  const filtered = categorias.filter((c) =>
    c.nombre.toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (c: Categoria) => {
    setEditingId(c.id);
    setForm({
      nombre: c.nombre,
      descripcion: c.descripcion || "",
      color: c.color || "",
      activo: c.activo,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const url = editingId ? `/api/categorias/${editingId}` : "/api/categorias";
    const method = editingId ? "PUT" : "POST";
    await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        descripcion: form.descripcion || null,
        color: form.color || null,
      }),
    });
    setDialogOpen(false);
    setLoading(false);
    fetchCategorias();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar esta categoría?")) return;
    await fetch(`/api/categorias/${id}`, { method: "DELETE" });
    fetchCategorias();
  };

  const updateField = (field: string, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const getModelImages = (c: Categoria): string[] => {
    return c.modeloImagenes.slice(0, 4);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Categorias</h1>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva Categoria
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar categoria..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex rounded-md border">
          <Button
            variant={viewMode === "cards" ? "default" : "ghost"}
            size="sm"
            className="rounded-r-none"
            onClick={() => setViewMode("cards")}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "table" ? "default" : "ghost"}
            size="sm"
            className="rounded-l-none"
            onClick={() => setViewMode("table")}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {viewMode === "cards" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.length === 0 ? (
            <div className="col-span-full text-center text-muted-foreground py-12">
              {categorias.length === 0 ? "No hay categorias registradas." : "Sin resultados."}
            </div>
          ) : (
            filtered.map((c) => {
              const images = getModelImages(c);
              return (
                <Card key={c.id} className="group relative overflow-hidden">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        {c.color && (
                          <div
                            className="h-3 w-3 rounded-full shrink-0"
                            style={{ backgroundColor: c.color }}
                          />
                        )}
                        <CardTitle className="text-base truncate">{c.nombre}</CardTitle>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(c.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    {c.descripcion && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{c.descripcion}</p>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Image collage */}
                    <div className="grid grid-cols-2 gap-1 aspect-square rounded-md overflow-hidden bg-muted">
                      {images.length === 0 ? (
                        <div className="col-span-2 row-span-2 flex items-center justify-center">
                          <Box className="h-10 w-10 text-muted-foreground/40" />
                        </div>
                      ) : (
                        Array.from({ length: 4 }).map((_, i) => {
                          const imgUrl = images[i];
                          return imgUrl ? (
                            <img
                              key={i}
                              src={imgUrl}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div key={i} className="flex items-center justify-center bg-muted">
                              <Box className="h-5 w-5 text-muted-foreground/30" />
                            </div>
                          );
                        })
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="gap-1">
                        <Tag className="h-3 w-3" />
                        {c._count.modelos} {c._count.modelos === 1 ? "modelo" : "modelos"}
                      </Badge>
                      <Badge variant={c.activo ? "default" : "secondary"}>
                        {c.activo ? "Activo" : "Inactivo"}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[150px]">Nombre</TableHead>
                <TableHead>Descripcion</TableHead>
                <TableHead>Modelos</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-[100px]">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    {categorias.length === 0 ? "No hay categorias registradas." : "Sin resultados."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((c) => (
                  <React.Fragment key={c.id}>
                    <TableRow
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${expandedId === c.id ? "rotate-90" : ""}`} />
                          {c.color && (
                            <div
                              className="h-3 w-3 rounded-full shrink-0"
                              style={{ backgroundColor: c.color }}
                            />
                          )}
                          {c.nombre}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {c.descripcion || "—"}
                      </TableCell>
                      <TableCell>{c._count.modelos}</TableCell>
                      <TableCell>
                        <Badge variant={c.activo ? "default" : "secondary"}>
                          {c.activo ? "Activo" : "Inactivo"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openEdit(c); }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedId === c.id && (
                      <TableRow>
                        <TableCell colSpan={5} className="bg-muted/30 p-4">
                          <div className="space-y-2">
                            <div>
                              <span className="text-sm font-medium">Descripcion</span>
                              {c.descripcion ? (
                                <p className="text-sm">{c.descripcion}</p>
                              ) : (
                                <p className="text-sm text-muted-foreground">Sin descripcion</p>
                              )}
                            </div>
                            {c.color && (
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">Color:</span>
                                <div
                                  className="h-4 w-4 rounded-full border"
                                  style={{ backgroundColor: c.color }}
                                />
                                <span className="text-sm text-muted-foreground">{c.color}</span>
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
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Categoria" : "Nueva Categoria"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre *</Label>
              <Input id="nombre" value={form.nombre} onChange={(e) => updateField("nombre", e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="descripcion">Descripcion</Label>
              <Textarea id="descripcion" value={form.descripcion} onChange={(e) => updateField("descripcion", e.target.value)} rows={3} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="color">Color</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="color"
                  value={form.color}
                  onChange={(e) => updateField("color", e.target.value)}
                  placeholder="#3b82f6"
                  className="flex-1"
                />
                {form.color && (
                  <div
                    className="h-9 w-9 rounded-md border shrink-0"
                    style={{ backgroundColor: form.color }}
                  />
                )}
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${form.color === color ? "border-foreground scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: color }}
                    onClick={() => updateField("color", color)}
                  />
                ))}
                {form.color && (
                  <button
                    type="button"
                    className="h-6 px-2 rounded-full border text-xs text-muted-foreground hover:bg-muted"
                    onClick={() => updateField("color", "")}
                  >
                    Quitar
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant={form.activo ? "default" : "secondary"}
                size="sm"
                onClick={() => updateField("activo", !form.activo)}
              >
                {form.activo ? <Eye className="mr-1 h-4 w-4" /> : <EyeOff className="mr-1 h-4 w-4" />}
                {form.activo ? "Activo" : "Inactivo"}
              </Button>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={loading}>{loading ? "Guardando..." : "Guardar"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
