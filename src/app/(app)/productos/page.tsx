"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Plus, Search, Pencil, Trash2, Eye, EyeOff, ChevronRight } from "lucide-react";
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
import { TableSkeleton } from "@/components/data-loading";

interface Producto {
  id: string;
  nombre: string;
  tamanioCm: number | null;
  pesoPromedioGr: number | null;
  costoBaseFab: number;
  precioBaseVenta: number;
  precioCreditoPorc: number;
  reglasDescuento: unknown;
  notas: string | null;
  activo: boolean;
  _count: { modelos: number };
}

const emptyForm = {
  nombre: "",
  tamanioCm: "",
  pesoPromedioGr: "",
  costoBaseFab: "",
  precioBaseVenta: "",
  precioCreditoPorc: "10",
  notas: "",
  activo: true,
};

export default function ProductosPage() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchProductos = useCallback(async () => {
    const res = await fetch("/api/productos");
    setProductos(await res.json());
    setInitialLoading(false);
  }, []);

  useEffect(() => { fetchProductos(); }, [fetchProductos]);

  if (initialLoading) return <TableSkeleton cols={8} />;

  const filtered = productos.filter((p) =>
    p.nombre.toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (p: Producto) => {
    setEditingId(p.id);
    setForm({
      nombre: p.nombre,
      tamanioCm: p.tamanioCm?.toString() || "",
      pesoPromedioGr: p.pesoPromedioGr?.toString() || "",
      costoBaseFab: p.costoBaseFab.toString(),
      precioBaseVenta: p.precioBaseVenta.toString(),
      precioCreditoPorc: p.precioCreditoPorc.toString(),
      notas: p.notas || "",
      activo: p.activo,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const url = editingId ? `/api/productos/${editingId}` : "/api/productos";
    const method = editingId ? "PUT" : "POST";
    await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setDialogOpen(false);
    setLoading(false);
    fetchProductos();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este producto y todos sus modelos?")) return;
    await fetch(`/api/productos/${id}`, { method: "DELETE" });
    fetchProductos();
  };

  const updateField = (field: string, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const precioCredito = (base: string, porc: string) => {
    const b = parseFloat(base);
    const p = parseFloat(porc);
    if (isNaN(b) || isNaN(p)) return "—";
    return `$${(b * (1 + p / 100)).toFixed(0)}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Productos</h1>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Producto
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar producto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[120px]">Nombre</TableHead>
              <TableHead>Tamaño</TableHead>
              <TableHead>Costo Fab.</TableHead>
              <TableHead>Precio Venta</TableHead>
              <TableHead>Precio Crédito</TableHead>
              <TableHead>Modelos</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-[100px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  {productos.length === 0 ? "No hay productos registrados." : "Sin resultados."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => (
                <React.Fragment key={p.id}>
                  <TableRow
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${expandedId === p.id ? "rotate-90" : ""}`} />
                        {p.nombre}
                      </div>
                    </TableCell>
                    <TableCell>{p.tamanioCm ? `${p.tamanioCm} cm` : "—"}</TableCell>
                    <TableCell>${p.costoBaseFab.toFixed(0)}</TableCell>
                    <TableCell>${p.precioBaseVenta.toFixed(0)}</TableCell>
                    <TableCell>
                      {precioCredito(p.precioBaseVenta.toString(), p.precioCreditoPorc.toString())}
                    </TableCell>
                    <TableCell>{p._count.modelos}</TableCell>
                    <TableCell>
                      <Badge variant={p.activo ? "default" : "secondary"}>
                        {p.activo ? "Activo" : "Inactivo"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openEdit(p); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {expandedId === p.id && (
                    <TableRow>
                      <TableCell colSpan={8} className="bg-muted/30 p-4">
                        <div className="space-y-2">
                          <div>
                            <span className="text-sm font-medium">Peso promedio: </span>
                            <span className="text-sm">{p.pesoPromedioGr ? `${p.pesoPromedioGr} g` : "—"}</span>
                          </div>
                          <div>
                            <span className="text-sm font-medium">Notas</span>
                            {p.notas ? (
                              <p className="text-sm">{p.notas}</p>
                            ) : (
                              <p className="text-sm text-muted-foreground">Sin notas</p>
                            )}
                          </div>
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
            <DialogTitle>{editingId ? "Editar Producto" : "Nuevo Producto"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre *</Label>
              <Input id="nombre" value={form.nombre} onChange={(e) => updateField("nombre", e.target.value)} required />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tamanioCm">Tamaño (cm)</Label>
                <Input id="tamanioCm" type="number" step="0.1" value={form.tamanioCm} onChange={(e) => updateField("tamanioCm", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pesoPromedioGr">Peso promedio (g)</Label>
                <Input id="pesoPromedioGr" type="number" step="0.1" value={form.pesoPromedioGr} onChange={(e) => updateField("pesoPromedioGr", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="costoBaseFab">Costo fabricación *</Label>
                <Input id="costoBaseFab" type="number" step="1" value={form.costoBaseFab} onChange={(e) => updateField("costoBaseFab", e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="precioBaseVenta">Precio venta *</Label>
                <Input id="precioBaseVenta" type="number" step="1" value={form.precioBaseVenta} onChange={(e) => updateField("precioBaseVenta", e.target.value)} required />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="precioCreditoPorc">% recargo crédito</Label>
                <Input id="precioCreditoPorc" type="number" step="1" value={form.precioCreditoPorc} onChange={(e) => updateField("precioCreditoPorc", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Precio crédito calculado</Label>
                <div className="flex h-9 items-center rounded-md border bg-muted px-3 text-sm">
                  {precioCredito(form.precioBaseVenta, form.precioCreditoPorc)}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notas">Notas</Label>
              <Textarea id="notas" value={form.notas} onChange={(e) => updateField("notas", e.target.value)} rows={2} />
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
