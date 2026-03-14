"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/data-loading";

interface Gasto {
  id: string;
  fecha: string;
  categoria: string;
  monto: number;
  descripcion: string | null;
}

const CATEGORIAS = [
  "Filamento",
  "Mantenimiento impresora",
  "Empaquetado",
  "Envío",
  "Electricidad",
  "Herramientas",
  "Publicidad",
  "Otro",
];

const emptyForm = {
  fecha: new Date().toISOString().slice(0, 10),
  categoria: "Filamento",
  monto: "",
  descripcion: "",
};

export default function GastosPage() {
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const fetchGastos = useCallback(async () => {
    const res = await fetch("/api/gastos");
    setGastos(await res.json());
    setInitialLoading(false);
  }, []);

  useEffect(() => { fetchGastos(); }, [fetchGastos]);

  const filtered = gastos.filter((g) =>
    g.categoria.toLowerCase().includes(search.toLowerCase()) ||
    g.descripcion?.toLowerCase().includes(search.toLowerCase())
  );

  const totalFiltrado = filtered.reduce((s, g) => s + g.monto, 0);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm, fecha: new Date().toISOString().slice(0, 10) });
    setDialogOpen(true);
  };

  const openEdit = (g: Gasto) => {
    setEditingId(g.id);
    setForm({
      fecha: g.fecha.slice(0, 10),
      categoria: g.categoria,
      monto: g.monto.toString(),
      descripcion: g.descripcion || "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const url = editingId ? `/api/gastos/${editingId}` : "/api/gastos";
    const method = editingId ? "PUT" : "POST";
    await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setDialogOpen(false);
    setLoading(false);
    fetchGastos();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este gasto?")) return;
    await fetch(`/api/gastos/${id}`, { method: "DELETE" });
    fetchGastos();
  };

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  if (initialLoading) return <TableSkeleton cols={5} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold">Gastos</h1>
          {filtered.length > 0 && (
            <Badge variant="outline" className="text-sm py-1 px-3">
              Total: ${totalFiltrado.toFixed(0)}
            </Badge>
          )}
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Gasto
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por categoría o descripción..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Monto</TableHead>
              <TableHead className="min-w-[120px]">Descripción</TableHead>
              <TableHead className="w-[100px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  {gastos.length === 0 ? "No hay gastos registrados." : "Sin resultados."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((g) => (
                <TableRow key={g.id}>
                  <TableCell className="text-sm">
                    {new Date(g.fecha).toLocaleDateString("es-AR")}
                  </TableCell>
                  <TableCell><Badge variant="outline">{g.categoria}</Badge></TableCell>
                  <TableCell className="font-medium">${g.monto.toFixed(0)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{g.descripcion || "—"}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(g)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(g.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Gasto" : "Nuevo Gasto"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fecha">Fecha *</Label>
                <Input id="fecha" type="date" value={form.fecha} onChange={(e) => updateField("fecha", e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Categoría *</Label>
                <Select value={form.categoria} onValueChange={(v) => updateField("categoria", v ?? "Otro")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="monto">Monto ($) *</Label>
              <Input id="monto" type="number" step="1" value={form.monto} onChange={(e) => updateField("monto", e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="descripcion">Descripción</Label>
              <Input id="descripcion" value={form.descripcion} onChange={(e) => updateField("descripcion", e.target.value)} placeholder="Detalle del gasto" />
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
