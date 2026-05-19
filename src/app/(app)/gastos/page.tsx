"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Search, Pencil, Trash2, Receipt, Factory, Building2, Layers } from "lucide-react";
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/data-loading";
import { EmptyState } from "@/components/empty-state";

interface Gasto {
  id: string;
  fecha: string;
  categoria: string;
  monto: number;
  descripcion: string | null;
  billetera: string;
  grupoCuotasId: string | null;
  cuotaNumero: number | null;
  cuotaTotal: number | null;
}

const CATEGORIAS_FAB = [
  "Filamento",
  "Mantenimiento impresora",
  "Empaquetado",
  "Envío",
  "Electricidad",
  "Herramientas",
  "Impresora 3D",
  "Otro (fabricación)",
];
const CATEGORIAS_EMP = [
  "Alquiler",
  "Sueldos",
  "Servicios",
  "Contador",
  "Marketing/Publicidad",
  "Software/Licencias",
  "Impuestos",
  "Otro (empresarial)",
];

const emptyForm = {
  fecha: new Date().toISOString().slice(0, 10),
  categoria: "Filamento",
  monto: "",
  descripcion: "",
  billetera: "fabricacion" as "fabricacion" | "empresarial",
  conCuotas: false,
  cantidadCuotas: "12",
  fechaPrimera: new Date().toISOString().slice(0, 10),
};

type FiltroBilletera = "todas" | "fabricacion" | "empresarial";

export default function GastosPage() {
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [search, setSearch] = useState("");
  const [filterBilletera, setFilterBilletera] = useState<FiltroBilletera>("todas");
  const [agruparCuotas, setAgruparCuotas] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [expandedGrupos, setExpandedGrupos] = useState<Set<string>>(new Set());

  const fetchGastos = useCallback(async () => {
    const res = await fetch("/api/gastos");
    setGastos(await res.json());
    setInitialLoading(false);
  }, []);

  useEffect(() => { fetchGastos(); }, [fetchGastos]);

  const filtered = gastos.filter((g) => {
    const matchSearch =
      g.categoria.toLowerCase().includes(search.toLowerCase()) ||
      g.descripcion?.toLowerCase().includes(search.toLowerCase());
    const matchBilletera = filterBilletera === "todas" || g.billetera === filterBilletera;
    return matchSearch && matchBilletera;
  });

  // Si agruparCuotas está activo, mostramos solo 1 fila por grupoCuotasId
  // (la cuota más temprana representa al grupo) + las individuales que no son cuotas.
  interface FilaAgrupada extends Gasto {
    esGrupo: boolean;
    grupoTotal?: number;
    cuotasGrupo?: Gasto[];
  }
  let filas: FilaAgrupada[];
  if (agruparCuotas) {
    const gruposMap = new Map<string, Gasto[]>();
    const individuales: Gasto[] = [];
    filtered.forEach((g) => {
      if (g.grupoCuotasId) {
        const arr = gruposMap.get(g.grupoCuotasId) || [];
        arr.push(g);
        gruposMap.set(g.grupoCuotasId, arr);
      } else {
        individuales.push(g);
      }
    });
    filas = [
      ...individuales.map((g) => ({ ...g, esGrupo: false })),
      ...Array.from(gruposMap.values()).map((grupo) => {
        const ordenado = grupo.sort((a, b) => (a.cuotaNumero ?? 0) - (b.cuotaNumero ?? 0));
        const representante = ordenado[0];
        return {
          ...representante,
          esGrupo: true,
          grupoTotal: grupo.reduce((s, g) => s + g.monto, 0),
          cuotasGrupo: ordenado,
        };
      }),
    ].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  } else {
    filas = filtered
      .map((g) => ({ ...g, esGrupo: false }))
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  }

  const totalFiltrado = filtered.reduce((s, g) => s + g.monto, 0);
  const totalFab = filtered.filter((g) => g.billetera === "fabricacion").reduce((s, g) => s + g.monto, 0);
  const totalEmp = filtered.filter((g) => g.billetera === "empresarial").reduce((s, g) => s + g.monto, 0);

  const openCreate = () => {
    setEditingId(null);
    setEditingGroupId(null);
    setForm({ ...emptyForm, fecha: new Date().toISOString().slice(0, 10), fechaPrimera: new Date().toISOString().slice(0, 10) });
    setDialogOpen(true);
  };

  const openEdit = (g: Gasto) => {
    setEditingId(g.id);
    setEditingGroupId(g.grupoCuotasId);
    setForm({
      fecha: g.fecha.slice(0, 10),
      categoria: g.categoria,
      monto: g.monto.toString(),
      descripcion: (g.descripcion || "").replace(/ \(Cuota \d+\/\d+\)$/, ""),
      billetera: g.billetera === "empresarial" ? "empresarial" : "fabricacion",
      conCuotas: false,
      cantidadCuotas: g.cuotaTotal?.toString() || "12",
      fechaPrimera: g.fecha.slice(0, 10),
    });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (editingId) {
      // Si está en un grupo de cuotas, preguntamos si aplicar al grupo
      let aplicarAGrupo = false;
      if (editingGroupId) {
        aplicarAGrupo = confirm(
          "Este gasto es parte de un grupo de cuotas. ¿Aplicar los cambios a TODAS las cuotas del grupo?\n\n" +
          "Aceptar = todas las cuotas\nCancelar = solo esta"
        );
      }
      await fetch(`/api/gastos/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fecha: form.fecha,
          categoria: form.categoria,
          monto: form.monto,
          descripcion: form.descripcion,
          billetera: form.billetera,
          aplicarAGrupo,
        }),
      });
      toast.success(aplicarAGrupo ? "Grupo de cuotas actualizado" : "Gasto actualizado");
    } else if (form.conCuotas) {
      const res = await fetch("/api/gastos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fecha: form.fecha,
          categoria: form.categoria,
          monto: form.monto,
          descripcion: form.descripcion,
          billetera: form.billetera,
          cuotas: {
            cantidad: parseInt(form.cantidadCuotas, 10),
            fechaPrimera: form.fechaPrimera,
          },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(`Compra registrada: ${data.cantidad} cuotas creadas`);
      } else {
        const err = await res.json();
        toast.error(err.error || "Error al guardar");
        setLoading(false);
        return;
      }
    } else {
      await fetch("/api/gastos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fecha: form.fecha,
          categoria: form.categoria,
          monto: form.monto,
          descripcion: form.descripcion,
          billetera: form.billetera,
        }),
      });
      toast.success("Gasto registrado");
    }

    setDialogOpen(false);
    setLoading(false);
    fetchGastos();
  };

  const handleDelete = async (fila: FilaAgrupada) => {
    if (fila.esGrupo) {
      const ok = confirm(
        `¿Eliminar las ${fila.cuotasGrupo!.length} cuotas de "${(fila.descripcion || "").replace(/ \(Cuota \d+\/\d+\)$/, "") || fila.categoria}"?\n\n` +
        `Total a borrar: $${fila.grupoTotal!.toFixed(0)}`
      );
      if (!ok) return;
      await fetch(`/api/gastos/${fila.id}?modo=grupo`, { method: "DELETE" });
      toast.success(`${fila.cuotasGrupo!.length} cuotas eliminadas`);
    } else if (fila.grupoCuotasId) {
      // Cuota individual dentro de un grupo desagrupado
      const ok = confirm("¿Eliminar SOLO esta cuota o TODAS las cuotas del grupo?\n\nAceptar = solo esta\nCancelar = abortar");
      if (!ok) return;
      await fetch(`/api/gastos/${fila.id}?modo=individual`, { method: "DELETE" });
      toast.success("Cuota eliminada");
    } else {
      if (!confirm("¿Eliminar este gasto?")) return;
      await fetch(`/api/gastos/${fila.id}`, { method: "DELETE" });
      toast.success("Gasto eliminado");
    }
    fetchGastos();
  };

  const toggleGrupo = (id: string) => {
    setExpandedGrupos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const updateField = <K extends keyof typeof emptyForm>(field: K, value: typeof emptyForm[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const categoriasDisponibles = form.billetera === "empresarial" ? CATEGORIAS_EMP : CATEGORIAS_FAB;

  if (initialLoading) return <TableSkeleton cols={6} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold">Gastos</h1>
          {filtered.length > 0 && (
            <>
              <Badge variant="outline" className="text-sm py-1 px-3">
                Total: ${totalFiltrado.toFixed(0)}
              </Badge>
              <Badge variant="outline" className="text-xs py-1 px-2 border-purple-500/30 text-purple-500">
                <Factory className="h-3 w-3 mr-1" /> Fab: ${totalFab.toFixed(0)}
              </Badge>
              <Badge variant="outline" className="text-xs py-1 px-2 border-emerald-500/30 text-emerald-500">
                <Building2 className="h-3 w-3 mr-1" /> Emp: ${totalEmp.toFixed(0)}
              </Badge>
            </>
          )}
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Gasto
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por categoría o descripción..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="inline-flex rounded-md border text-sm overflow-hidden">
          {([
            { val: "todas", label: "Todas" },
            { val: "fabricacion", label: "Fabricación" },
            { val: "empresarial", label: "Empresarial" },
          ] as const).map((e, i) => (
            <button
              key={e.val}
              type="button"
              onClick={() => setFilterBilletera(e.val)}
              className={`px-3 h-9 transition-colors ${
                filterBilletera === e.val
                  ? "bg-primary text-primary-foreground"
                  : "bg-background hover:bg-muted"
              } ${i > 0 ? "border-l" : ""}`}
            >
              {e.label}
            </button>
          ))}
        </div>

        <Button
          variant={agruparCuotas ? "default" : "outline"}
          size="sm"
          className="gap-1.5 h-9"
          onClick={() => setAgruparCuotas(!agruparCuotas)}
          title="Agrupar cuotas como 1 sola fila"
        >
          <Layers className="h-3.5 w-3.5" />
          {agruparCuotas ? "Cuotas agrupadas" : "Cuotas desagrupadas"}
        </Button>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Billetera</TableHead>
              <TableHead>Monto</TableHead>
              <TableHead className="min-w-[160px]">Descripción</TableHead>
              <TableHead className="w-[100px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-0">
                  {gastos.length === 0 ? (
                    <EmptyState
                      icon={Receipt}
                      title="Sin gastos registrados"
                      description="Registra tus gastos para trackear costos operativos y ver el impacto en tus finanzas."
                      actionLabel="Registrar gasto"
                      onAction={openCreate}
                    />
                  ) : (
                    <EmptyState
                      icon={Search}
                      title="Sin resultados"
                      description="No se encontraron gastos con esa búsqueda."
                    />
                  )}
                </TableCell>
              </TableRow>
            ) : (
              filas.flatMap((fila) => {
                const baseRow = (
                  <TableRow
                    key={fila.id}
                    className={fila.esGrupo ? "cursor-pointer hover:bg-muted/40" : undefined}
                    onClick={fila.esGrupo ? () => toggleGrupo(fila.grupoCuotasId!) : undefined}
                  >
                    <TableCell className="text-sm">
                      {fila.esGrupo ? (
                        <span className="text-muted-foreground">
                          {new Date(fila.fecha).toLocaleDateString("es-AR")}
                          {" → "}
                          {new Date(fila.cuotasGrupo![fila.cuotasGrupo!.length - 1].fecha).toLocaleDateString("es-AR")}
                        </span>
                      ) : (
                        new Date(fila.fecha).toLocaleDateString("es-AR")
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{fila.categoria}</Badge>
                      {fila.esGrupo && (
                        <Badge variant="outline" className="ml-1.5 text-[10px] py-0 px-1 border-blue-500/30 text-blue-500">
                          {fila.cuotaTotal} cuotas
                        </Badge>
                      )}
                      {!fila.esGrupo && fila.grupoCuotasId && (
                        <Badge variant="outline" className="ml-1.5 text-[10px] py-0 px-1 border-blue-500/30 text-blue-500">
                          {fila.cuotaNumero}/{fila.cuotaTotal}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {fila.billetera === "empresarial" ? (
                        <Badge variant="outline" className="border-emerald-500/30 text-emerald-500 text-xs">
                          <Building2 className="h-3 w-3 mr-1" /> Empresarial
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-purple-500/30 text-purple-500 text-xs">
                          <Factory className="h-3 w-3 mr-1" /> Fabricación
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      ${(fila.esGrupo ? fila.grupoTotal! : fila.monto).toFixed(0)}
                      {fila.esGrupo && (
                        <span className="block text-[10px] text-muted-foreground">
                          ${fila.monto.toFixed(0)}/cuota
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {(fila.descripcion || "").replace(/ \(Cuota \d+\/\d+\)$/, "") || "—"}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(fila)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(fila)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );

                // Sub-filas expandidas del grupo
                if (fila.esGrupo && expandedGrupos.has(fila.grupoCuotasId!) && fila.cuotasGrupo) {
                  return [
                    baseRow,
                    ...fila.cuotasGrupo.map((cuota) => (
                      <TableRow key={cuota.id} className="bg-muted/30 hover:bg-muted/40">
                        <TableCell className="text-xs pl-8">
                          {new Date(cuota.fecha).toLocaleDateString("es-AR")}
                          <span className="ml-2 text-muted-foreground">
                            {new Date(cuota.fecha) <= new Date() ? "✓ pagada" : "⌛ pendiente"}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs">
                          <Badge variant="outline" className="text-[10px] py-0 px-1 border-blue-500/30 text-blue-500">
                            {cuota.cuotaNumero}/{cuota.cuotaTotal}
                          </Badge>
                        </TableCell>
                        <TableCell></TableCell>
                        <TableCell className="text-xs">${cuota.monto.toFixed(0)}</TableCell>
                        <TableCell></TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={async () => {
                              if (!confirm("¿Eliminar solo esta cuota?")) return;
                              await fetch(`/api/gastos/${cuota.id}?modo=individual`, { method: "DELETE" });
                              toast.success("Cuota eliminada");
                              fetchGastos();
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )),
                  ];
                }
                return [baseRow];
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Editar Gasto" : form.conCuotas ? "Nueva compra en cuotas" : "Nuevo Gasto"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Billetera */}
            <div className="space-y-2">
              <Label>Billetera *</Label>
              <div className="inline-flex w-full rounded-md border text-sm overflow-hidden">
                {([
                  { val: "fabricacion", label: "Fabricación", icon: Factory },
                  { val: "empresarial", label: "Empresarial", icon: Building2 },
                ] as const).map(({ val, label, icon: Icon }, i) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => {
                      updateField("billetera", val);
                      // Resetea categoría si cambia de billetera
                      const cats = val === "empresarial" ? CATEGORIAS_EMP : CATEGORIAS_FAB;
                      if (!cats.includes(form.categoria)) updateField("categoria", cats[0]);
                    }}
                    className={`flex-1 px-3 h-10 flex items-center justify-center gap-2 transition-colors ${
                      form.billetera === val
                        ? "bg-primary text-primary-foreground"
                        : "bg-background hover:bg-muted"
                    } ${i > 0 ? "border-l" : ""}`}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {form.billetera === "fabricacion"
                  ? "Para gastos de producción (filamento, mantenimiento, herramientas)"
                  : "Para gastos fijos de la empresa (alquiler, sueldos, servicios)"}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fecha">Fecha *</Label>
                <Input id="fecha" type="date" value={form.fecha} onChange={(e) => updateField("fecha", e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Categoría *</Label>
                <Select value={form.categoria} onValueChange={(v) => updateField("categoria", v ?? categoriasDisponibles[0])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {categoriasDisponibles.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="monto">
                Monto {form.conCuotas ? "TOTAL" : ""} ($) *
              </Label>
              <Input
                id="monto"
                type="number"
                step="1"
                value={form.monto}
                onChange={(e) => updateField("monto", e.target.value)}
                required
              />
              {form.conCuotas && form.monto && parseInt(form.cantidadCuotas) > 0 && (
                <p className="text-xs text-muted-foreground">
                  Se crearán {form.cantidadCuotas} cuotas de ${(parseFloat(form.monto) / parseInt(form.cantidadCuotas)).toFixed(0)} cada una
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="descripcion">Descripción</Label>
              <Input id="descripcion" value={form.descripcion} onChange={(e) => updateField("descripcion", e.target.value)} placeholder="Detalle del gasto" />
            </div>

            {/* Toggle cuotas (solo en creación) */}
            {!editingId && (
              <div className="space-y-3 rounded-md border p-3 bg-muted/30">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.conCuotas}
                    onChange={(e) => updateField("conCuotas", e.target.checked)}
                    className="h-4 w-4 rounded border-input accent-primary"
                  />
                  <span className="text-sm font-medium">Pago en cuotas</span>
                </label>
                {form.conCuotas && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="cant-cuotas" className="text-xs">Cantidad de cuotas</Label>
                      <Input
                        id="cant-cuotas"
                        type="number"
                        min="2"
                        max="60"
                        value={form.cantidadCuotas}
                        onChange={(e) => updateField("cantidadCuotas", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="fecha-primera" className="text-xs">Fecha primera cuota</Label>
                      <Input
                        id="fecha-primera"
                        type="date"
                        value={form.fechaPrimera}
                        onChange={(e) => updateField("fechaPrimera", e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

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
