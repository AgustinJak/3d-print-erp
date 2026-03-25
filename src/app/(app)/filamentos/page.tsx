"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Search, Pencil, Trash2, Palette } from "lucide-react";
import { toast } from "sonner";
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

interface Filamento {
  id: string;
  marca: string;
  tipoMaterial: string;
  color: string;
  tempExtrusor: number | null;
  tempCama: number | null;
  velocidadRec: number | null;
  pesoCarreteGr: number | null;
  pesoRestanteGr: number | null;
  costoPorGr: number | null;
  notas: string | null;
}

const MATERIALES = ["PLA", "PETG", "TPU", "ABS", "ASA", "Nylon"];

const emptyForm = {
  marca: "",
  tipoMaterial: "PLA",
  color: "",
  tempExtrusor: "",
  tempCama: "",
  velocidadRec: "",
  pesoCarreteGr: "1000",
  pesoRestanteGr: "1000",
  costoPorGr: "",
  notas: "",
};

export default function FilamentosPage() {
  const [filamentos, setFilamentos] = useState<Filamento[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const fetchFilamentos = useCallback(async () => {
    const res = await fetch("/api/filamentos");
    setFilamentos(await res.json());
    setInitialLoading(false);
  }, []);

  useEffect(() => { fetchFilamentos(); }, [fetchFilamentos]);

  const filtered = filamentos.filter((f) =>
    f.marca.toLowerCase().includes(search.toLowerCase()) ||
    f.color.toLowerCase().includes(search.toLowerCase()) ||
    f.tipoMaterial.toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (f: Filamento) => {
    setEditingId(f.id);
    setForm({
      marca: f.marca,
      tipoMaterial: f.tipoMaterial,
      color: f.color,
      tempExtrusor: f.tempExtrusor?.toString() || "",
      tempCama: f.tempCama?.toString() || "",
      velocidadRec: f.velocidadRec?.toString() || "",
      pesoCarreteGr: f.pesoCarreteGr?.toString() || "",
      pesoRestanteGr: f.pesoRestanteGr?.toString() || "",
      costoPorGr: f.costoPorGr?.toString() || "",
      notas: f.notas || "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const url = editingId ? `/api/filamentos/${editingId}` : "/api/filamentos";
    const method = editingId ? "PUT" : "POST";
    await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setDialogOpen(false);
    setLoading(false);
    toast.success(editingId ? "Filamento actualizado" : "Filamento creado");
    fetchFilamentos();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este filamento?")) return;
    await fetch(`/api/filamentos/${id}`, { method: "DELETE" });
    toast.success("Filamento eliminado");
    fetchFilamentos();
  };

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const porcentajeRestante = (f: Filamento) => {
    if (!f.pesoCarreteGr || !f.pesoRestanteGr) return null;
    return Math.round((f.pesoRestanteGr / f.pesoCarreteGr) * 100);
  };

  if (initialLoading) return <TableSkeleton cols={7} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Filamentos</h1>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Filamento
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por marca, color o material..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[120px]">Marca</TableHead>
              <TableHead>Material</TableHead>
              <TableHead>Color</TableHead>
              <TableHead>Temperaturas</TableHead>
              <TableHead>Restante</TableHead>
              <TableHead>$/g</TableHead>
              <TableHead className="w-[100px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-0">
                  {filamentos.length === 0 ? (
                    <EmptyState
                      icon={Palette}
                      title="Sin filamentos registrados"
                      description="Agrega tus filamentos para trackear stock, costos y colores disponibles."
                      actionLabel="Agregar filamento"
                      onAction={openCreate}
                    />
                  ) : (
                    <EmptyState
                      icon={Search}
                      title="Sin resultados"
                      description="No se encontraron filamentos con esa busqueda."
                    />
                  )}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((f) => {
                const pct = porcentajeRestante(f);
                return (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.marca}</TableCell>
                    <TableCell><Badge variant="outline">{f.tipoMaterial}</Badge></TableCell>
                    <TableCell>{f.color}</TableCell>
                    <TableCell className="text-sm">
                      {f.tempExtrusor && f.tempCama
                        ? `${f.tempExtrusor}°/${f.tempCama}°`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {pct !== null ? (
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-16 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full ${pct > 30 ? "bg-primary" : pct > 10 ? "bg-yellow-500" : "bg-red-500"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-sm">{f.pesoRestanteGr}g</span>
                        </div>
                      ) : "—"}
                    </TableCell>
                    <TableCell>{f.costoPorGr ? `$${f.costoPorGr.toFixed(2)}` : "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(f)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(f.id)}>
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
            <DialogTitle>{editingId ? "Editar Filamento" : "Nuevo Filamento"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="marca">Marca *</Label>
                <Input id="marca" value={form.marca} onChange={(e) => updateField("marca", e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Material *</Label>
                <Select value={form.tipoMaterial} onValueChange={(v) => updateField("tipoMaterial", v ?? "PLA")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MATERIALES.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="color">Color *</Label>
              <Input id="color" value={form.color} onChange={(e) => updateField("color", e.target.value)} required placeholder="Ej: Negro, Blanco, Rojo..." />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tempExtrusor">Temp. extrusor (°C)</Label>
                <Input id="tempExtrusor" type="number" value={form.tempExtrusor} onChange={(e) => updateField("tempExtrusor", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tempCama">Temp. cama (°C)</Label>
                <Input id="tempCama" type="number" value={form.tempCama} onChange={(e) => updateField("tempCama", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="velocidadRec">Velocidad (mm/s)</Label>
                <Input id="velocidadRec" type="number" value={form.velocidadRec} onChange={(e) => updateField("velocidadRec", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pesoCarreteGr">Peso carrete (g)</Label>
                <Input id="pesoCarreteGr" type="number" value={form.pesoCarreteGr} onChange={(e) => updateField("pesoCarreteGr", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pesoRestanteGr">Peso restante (g)</Label>
                <Input id="pesoRestanteGr" type="number" value={form.pesoRestanteGr} onChange={(e) => updateField("pesoRestanteGr", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="costoPorGr">Costo por gramo ($)</Label>
                <Input id="costoPorGr" type="number" step="0.01" value={form.costoPorGr} onChange={(e) => updateField("costoPorGr", e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notas">Notas</Label>
              <Textarea id="notas" value={form.notas} onChange={(e) => updateField("notas", e.target.value)} rows={2} />
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
