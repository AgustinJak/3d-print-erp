"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Plus, Search, Pencil, Trash2, ChevronRight, User, MapPin, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TableSkeleton } from "@/components/data-loading";

interface Cliente {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  notas: string | null;
}

const emptyForm = {
  nombre: "",
  telefono: "",
  email: "",
  direccion: "",
  notas: "",
};

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchClientes = useCallback(async () => {
    const res = await fetch("/api/clientes");
    const data = await res.json();
    setClientes(data);
    setInitialLoading(false);
  }, []);

  useEffect(() => {
    fetchClientes();
  }, [fetchClientes]);

  if (initialLoading) return <TableSkeleton cols={5} />;

  const filtered = clientes.filter((c) =>
    c.nombre.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase()) ||
    c.telefono?.includes(search)
  );

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
    fetchClientes();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar este cliente?")) return;
    await fetch(`/api/clientes/${id}`, { method: "DELETE" });
    fetchClientes();
  };

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Clientes</h1>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Cliente
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre, email o teléfono..."
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
              <TableHead>Teléfono</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="min-w-[120px]">Dirección</TableHead>
              <TableHead className="w-[100px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  {clientes.length === 0
                    ? "No hay clientes registrados."
                    : "No se encontraron resultados."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((cliente) => (
                <React.Fragment key={cliente.id}>
                  <TableRow
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setExpandedId(expandedId === cliente.id ? null : cliente.id)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${expandedId === cliente.id ? "rotate-90" : ""}`} />
                        {cliente.nombre}
                      </div>
                    </TableCell>
                    <TableCell>{cliente.telefono || "—"}</TableCell>
                    <TableCell>{cliente.email || "—"}</TableCell>
                    <TableCell>{cliente.direccion || "—"}</TableCell>
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
                  {expandedId === cliente.id && (
                    <TableRow>
                      <TableCell colSpan={5} className="bg-muted/30 p-4">
                        <div className="space-y-1">
                          <span className="text-sm font-medium">Notas</span>
                          {cliente.notas ? (
                            <p className="text-sm">{cliente.notas}</p>
                          ) : (
                            <p className="text-sm text-muted-foreground">Sin notas</p>
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
