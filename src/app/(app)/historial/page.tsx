"use client";

import { useEffect, useState, useCallback } from "react";
import { Search, Trash2, Undo2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/data-loading";
import { CANALES_VENTA } from "@/lib/constants";

interface ItemPedido {
  cantidad: number;
  precioUnitario: number;
  costoUnitario: number;
  ajusteManual: number;
  modelo: {
    id: string;
    nombre: string;
    imagenUrl: string | null;
    categorias: Array<{ categoria: { id: string; nombre: string; color: string | null } }>;
  };
}

interface Pedido {
  id: string;
  fechaPedido: string;
  precioEnvio: number;
  canalVenta: string;
  cliente: { id: string; nombre: string } | null;
  items: ItemPedido[];
}

interface Modelo { id: string; nombre: string }
interface Cliente { id: string; nombre: string }

const ANIOS = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);
const MESES_OPTS = [
  { value: "todos", label: "Todos los meses" },
  ...Array.from({ length: 12 }, (_, i) => ({
    value: (i + 1).toString(),
    label: new Date(2000, i).toLocaleString("es-AR", { month: "long" }),
  })),
];

export default function HistorialPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [search, setSearch] = useState("");
  const [filterAnio, setFilterAnio] = useState(new Date().getFullYear().toString());
  const [filterMes, setFilterMes] = useState("todos");
  const [filterModelo, setFilterModelo] = useState("todos");
  const [filterCliente, setFilterCliente] = useState("todos");
  const [filterCanal, setFilterCanal] = useState("todos");
  const [initialLoading, setInitialLoading] = useState(true);

  const fetchPedidos = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("anio", filterAnio);
    if (filterMes !== "todos") params.set("mes", filterMes);
    if (filterModelo !== "todos") params.set("modeloId", filterModelo);
    if (filterCliente !== "todos") params.set("clienteId", filterCliente);
    if (filterCanal !== "todos") params.set("canal", filterCanal);

    const res = await fetch(`/api/historial?${params}`);
    setPedidos(await res.json());
    setInitialLoading(false);
  }, [filterAnio, filterMes, filterModelo, filterCliente, filterCanal]);

  const fetchRefs = useCallback(async () => {
    const [modRes, cliRes] = await Promise.all([
      fetch("/api/modelos"),
      fetch("/api/clientes"),
    ]);
    const modData = await modRes.json();
    setModelos(modData.map((m: Modelo & { _count?: unknown }) => ({ id: m.id, nombre: m.nombre })));
    const cliData = await cliRes.json();
    setClientes(cliData.map((c: Cliente) => ({ id: c.id, nombre: c.nombre })));
  }, []);

  useEffect(() => { fetchRefs(); }, [fetchRefs]);
  useEffect(() => { fetchPedidos(); }, [fetchPedidos]);

  const calcTotal = (p: Pedido) =>
    p.items.reduce((s, i) => s + i.precioUnitario * i.cantidad + i.ajusteManual, 0) + p.precioEnvio;

  const calcCosto = (p: Pedido) =>
    p.items.reduce((s, i) => s + i.costoUnitario * i.cantidad, 0);

  const filtered = pedidos.filter((p) =>
    p.cliente?.nombre.toLowerCase().includes(search.toLowerCase()) ||
    p.id.toLowerCase().includes(search.toLowerCase())
  );

  const totalIngresos = filtered.reduce((s, p) => s + calcTotal(p), 0);
  const totalCosto = filtered.reduce((s, p) => s + calcCosto(p), 0);

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este pedido del historial? Se descontará de las finanzas. Esta acción no se puede deshacer.")) return;
    await fetch(`/api/pedidos/${id}`, { method: "DELETE" });
    fetchPedidos();
  };

  const handleRevert = async (id: string) => {
    if (!confirm("¿Revertir este pedido a 'En producción'? Se quitará del historial y volverá a pedidos activos.")) return;
    await fetch(`/api/pedidos/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: "EN_PRODUCCION" }),
    });
    fetchPedidos();
  };

  if (initialLoading) return <TableSkeleton cols={7} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Historial de Pedidos</h1>
        <div className="flex gap-2">
          <Badge variant="outline" className="py-1 px-3">
            {filtered.length} pedidos
          </Badge>
          <Badge variant="outline" className="py-1 px-3">
            Ingresos: ${totalIngresos.toFixed(0)}
          </Badge>
          <Badge variant="default" className="py-1 px-3">
            Ganancia: ${(totalIngresos - totalCosto).toFixed(0)}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterAnio} onValueChange={(v) => setFilterAnio(v ?? filterAnio)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {ANIOS.map((a) => (
              <SelectItem key={a} value={a.toString()}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterMes} onValueChange={(v) => setFilterMes(v ?? "todos")}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {MESES_OPTS.map((m) => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterModelo} onValueChange={(v) => setFilterModelo(v ?? "todos")}>
          <SelectTrigger>
            <span className="truncate">{filterModelo === "todos" ? "Todos los modelos" : modelos.find(m => m.id === filterModelo)?.nombre ?? "..."}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los modelos</SelectItem>
            {modelos.map((m) => (
              <SelectItem key={m.id} value={m.id}>{m.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterCliente} onValueChange={(v) => setFilterCliente(v ?? "todos")}>
          <SelectTrigger>
            <span className="truncate">{filterCliente === "todos" ? "Todos los clientes" : clientes.find(c => c.id === filterCliente)?.nombre ?? "..."}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los clientes</SelectItem>
            {clientes.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterCanal} onValueChange={(v) => setFilterCanal(v ?? "todos")}>
          <SelectTrigger><SelectValue placeholder="Canal" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los canales</SelectItem>
            {CANALES_VENTA.map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead className="min-w-[120px]">Cliente</TableHead>
              <TableHead className="min-w-[120px]">Items</TableHead>
              <TableHead>Canal</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Ganancia</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  No hay pedidos completados con estos filtros.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => {
                const total = calcTotal(p);
                const costo = calcCosto(p);
                const ganancia = total - costo;
                const canalLabel = CANALES_VENTA.find((c) => c.value === p.canalVenta)?.label || p.canalVenta;
                return (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm">
                      {new Date(p.fechaPedido).toLocaleDateString("es-AR")}
                    </TableCell>
                    <TableCell className="font-medium">
                      {p.cliente?.nombre || "Sin cliente"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {p.items.map((i) => (
                        <div key={i.modelo.id} className="flex items-center gap-1 flex-wrap mb-0.5">
                          <span>{i.cantidad}x {i.modelo.nombre}</span>
                          {i.modelo.categorias.map(({ categoria }) => (
                            <Badge
                              key={categoria.id}
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0"
                              style={categoria.color ? { backgroundColor: categoria.color, color: "#fff" } : undefined}
                            >
                              {categoria.nombre}
                            </Badge>
                          ))}
                        </div>
                      ))}
                    </TableCell>
                    <TableCell><Badge variant="outline">{canalLabel}</Badge></TableCell>
                    <TableCell className="font-medium">${total.toFixed(0)}</TableCell>
                    <TableCell>
                      <span className={ganancia >= 0 ? "text-green-600 font-medium" : "text-red-500 font-medium"}>
                        ${ganancia.toFixed(0)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-orange-500"
                          onClick={() => handleRevert(p.id)}
                          title="Revertir a pedidos activos"
                        >
                          <Undo2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-red-500"
                          onClick={() => handleDelete(p.id)}
                          title="Eliminar pedido (reembolso)"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
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
    </div>
  );
}
