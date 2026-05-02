"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Plus, Search, Pencil, Trash2, ChevronDown, ChevronRight, AlertTriangle, ShoppingCart, GripVertical, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent } from "@/components/ui/card";
import { TableSkeleton } from "@/components/data-loading";
import { EmptyState } from "@/components/empty-state";
import { ESTADOS_PEDIDO, PRIORIDADES, CANALES_VENTA } from "@/lib/constants";
import { PedidoDialog } from "./pedido-dialog";

interface VarianteInfo {
  nombre: string;
  precioAdicional: number;
  costoFabAdicional?: number;
}

interface ItemPedido {
  id: string;
  modeloId: string;
  cantidad: number;
  precioUnitario: number;
  costoUnitario: number;
  ajusteManual: number;
  variantesInfo: VarianteInfo[] | null;
  modelo: {
    id: string;
    nombre: string;
    imagenUrl: string | null;
    categorias: Array<{ categoria: { id: string; nombre: string; color: string | null } }>;
  };
}

interface Pedido {
  id: string;
  prioridad: keyof typeof PRIORIDADES;
  clienteId: string | null;
  fechaPedido: string;
  fechaEntrega: string | null;
  estado: keyof typeof ESTADOS_PEDIDO;
  metodoEnvio: string | null;
  metodoPago: string | null;
  precioEnvio: number;
  senia: number;
  contacto: string | null;
  notas: string | null;
  etiquetas: string[];
  canalVenta: string;
  comprobanteUrl: string | null;
  fechaLiquidacionMl: string | null;
  idMercadolibre: string | null;
  cliente: { id: string; nombre: string } | null;
  items: ItemPedido[];
}

function calcTotal(items: ItemPedido[]) {
  return items.reduce((sum, item) =>
    sum + (item.precioUnitario * item.cantidad) + item.ajusteManual, 0
  );
}

function calcCosto(items: ItemPedido[]) {
  return items.reduce((sum, item) =>
    sum + (item.costoUnitario * item.cantidad), 0
  );
}

function getCanalLabel(value: string) {
  const canal = CANALES_VENTA.find((c) => c.value === value);
  return canal ? canal.label : value;
}

export default function PedidosPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [search, setSearch] = useState("");
  const [filterEstado, setFilterEstado] = useState<string>("todos");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPedido, setEditingPedido] = useState<Pedido | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);

  const fetchPedidos = useCallback(async () => {
    const res = await fetch("/api/pedidos");
    setPedidos(await res.json());
    setInitialLoading(false);
  }, []);

  useEffect(() => { fetchPedidos(); }, [fetchPedidos]);

  const filtered = pedidos.filter((p) => {
    const matchSearch =
      p.cliente?.nombre.toLowerCase().includes(search.toLowerCase()) ||
      p.id.toLowerCase().includes(search.toLowerCase()) ||
      p.notas?.toLowerCase().includes(search.toLowerCase());
    const matchEstado = filterEstado === "todos" || p.estado === filterEstado;
    return matchSearch && matchEstado;
  });

  const openCreate = () => {
    setEditingPedido(null);
    setDialogOpen(true);
  };

  const openEdit = (pedido: Pedido) => {
    setEditingPedido(pedido);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este pedido?")) return;
    await fetch(`/api/pedidos/${id}`, { method: "DELETE" });
    toast.success("Pedido eliminado");
    fetchPedidos();
  };

  const handleStatusChange = async (id: string, estado: string) => {
    await fetch(`/api/pedidos/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado }),
    });
    const label = ESTADOS_PEDIDO[estado as keyof typeof ESTADOS_PEDIDO]?.label ?? estado;
    toast.success(`Estado actualizado a "${label}"`);
    fetchPedidos();
  };

  const handlePrioridadChange = async (id: string, prioridad: string) => {
    await fetch(`/api/pedidos/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prioridad }),
    });
    toast.success("Prioridad actualizada");
    fetchPedidos();
  };

  const handleSaved = () => {
    setDialogOpen(false);
    toast.success(editingPedido ? "Pedido actualizado" : "Pedido creado");
    fetchPedidos();
  };

  const canDrag = search === "" && filterEstado === "todos";

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination || result.source.index === result.destination.index) return;

    const reordered = Array.from(filtered);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);

    // Optimistic update
    setPedidos(reordered);

    try {
      await fetch("/api/pedidos/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orden: reordered.map((p) => p.id) }),
      });
      toast.success("Orden actualizado");
    } catch {
      toast.error("Error al reordenar");
      fetchPedidos();
    }
  };

  /**
   * Ordena los pedidos por fecha de entrega (más próxima primero).
   * Pedidos sin fechaEntrega quedan al final.
   */
  const handleOrdenarPorFechaEntrega = async () => {
    const sorted = [...pedidos].sort((a, b) => {
      const aTime = a.fechaEntrega ? new Date(a.fechaEntrega).getTime() : Infinity;
      const bTime = b.fechaEntrega ? new Date(b.fechaEntrega).getTime() : Infinity;
      return aTime - bTime;
    });

    setPedidos(sorted);

    try {
      await fetch("/api/pedidos/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orden: sorted.map((p) => p.id) }),
      });
      toast.success("Pedidos ordenados por fecha de entrega");
    } catch {
      toast.error("Error al ordenar");
      fetchPedidos();
    }
  };

  if (initialLoading) return <TableSkeleton cols={7} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-bold">Pedidos</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleOrdenarPorFechaEntrega}
            disabled={pedidos.length === 0}
            title="Ordenar por fecha de entrega más próxima"
          >
            <CalendarClock className="mr-2 h-4 w-4" />
            Ordenar por entrega
          </Button>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo Pedido
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente, ID o notas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterEstado} onValueChange={(v) => setFilterEstado(v ?? "todos")}>
          <SelectTrigger>
            <SelectValue placeholder="Filtrar por estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los estados</SelectItem>
            {Object.entries(ESTADOS_PEDIDO).map(([key, val]) => (
              <SelectItem key={key} value={key}>{val.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Empty state */}
      {filtered.length === 0 ? (
        pedidos.length === 0 ? (
          <EmptyState
            icon={ShoppingCart}
            title="Sin pedidos todavia"
            description="Crea tu primer pedido para empezar a gestionar ventas, produccion y entregas."
            actionLabel="Crear pedido"
            onAction={openCreate}
          />
        ) : (
          <EmptyState
            icon={Search}
            title="Sin resultados"
            description="No se encontraron pedidos con estos filtros. Proba cambiando la busqueda o el estado."
          />
        )
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          {/* Mobile cards */}
          <Droppable droppableId="pedidos-mobile">
            {(provided) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="md:hidden space-y-3"
              >
                {filtered.map((p, index) => {
                  const total = calcTotal(p.items);
                  const costo = calcCosto(p.items);
                  const ganancia = total - costo;
                  const prioConfig = PRIORIDADES[p.prioridad];
                  const estadoConfig = ESTADOS_PEDIDO[p.estado];
                  const faltaLiquidacionMl =
                    p.canalVenta === "mercadolibre" &&
                    !p.fechaLiquidacionMl &&
                    p.estado !== "COMPLETADO";
                  return (
                    <Draggable key={p.id} draggableId={`mobile-${p.id}`} index={index} isDragDisabled={!canDrag}>
                      {(provided, snapshot) => (
                        <div ref={provided.innerRef} {...provided.draggableProps}>
                          <Card className={`${p.prioridad === "URGENTE" ? "border-red-500 border-2" : ""} ${snapshot.isDragging ? "ring-2 ring-primary shadow-lg" : ""}`}>
                            <CardContent className="pt-4 pb-3 space-y-3">
                              {/* Header: drag handle + client + total */}
                              <div className="flex items-start gap-2">
                                {canDrag && (
                                  <div
                                    {...provided.dragHandleProps}
                                    className="mt-1 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors"
                                  >
                                    <GripVertical className="h-5 w-5" />
                                  </div>
                                )}
                                <div className="flex-1 flex items-start justify-between">
                                  <div>
                                    <p className="font-semibold">
                                      {p.cliente?.nombre || <span className="text-muted-foreground">Sin cliente</span>}
                                    </p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <Badge variant="outline" className="gap-1 text-xs">
                                        <span className={`h-2 w-2 rounded-full ${prioConfig.color}`} />
                                        {prioConfig.label}
                                      </Badge>
                                      <span className="text-xs text-muted-foreground">
                                        {new Date(p.fechaPedido).toLocaleDateString("es-AR")}
                                      </span>
                                    </div>
                                  </div>
                                  <p className="text-lg font-bold">${total.toFixed(0)}</p>
                                </div>
                              </div>

                              {/* Items */}
                              <div className="space-y-1">
                                {p.items.map((item) => (
                                  <div key={item.id} className="text-sm">
                                    <span className="text-muted-foreground mr-1">{item.cantidad}×</span>
                                    <span className="font-medium">{item.modelo.nombre}</span>
                                  </div>
                                ))}
                              </div>

                              {/* Footer: estado + actions */}
                              <div className="flex items-center justify-between pt-2 border-t">
                                <div className="flex items-center gap-1">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger
                                      render={<Button variant="ghost" size="sm" className="gap-1 h-7 px-2" />}
                                    >
                                      <span className={`h-2 w-2 rounded-full ${estadoConfig.color}`} />
                                      {estadoConfig.label}
                                      <ChevronDown className="h-3 w-3" />
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent>
                                      {Object.entries(ESTADOS_PEDIDO).map(([key, val]) => (
                                        <DropdownMenuItem
                                          key={key}
                                          onClick={() => handleStatusChange(p.id, key)}
                                          className="gap-2"
                                        >
                                          <span className={`h-2 w-2 rounded-full ${val.color}`} />
                                          {val.label}
                                        </DropdownMenuItem>
                                      ))}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                  {faltaLiquidacionMl && (
                                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                                  )}
                                </div>
                                <div className="flex gap-1">
                                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(p.id)}>
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </div>
                              </div>

                              {/* Summary */}
                              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                <span>Ganancia: <strong className={ganancia >= 0 ? "text-green-600" : "text-red-500"}>${ganancia.toFixed(0)}</strong></span>
                                {p.senia > 0 && <span>Restante: <strong>${(total + p.precioEnvio - p.senia).toFixed(0)}</strong></span>}
                                {p.fechaEntrega && <span>Entrega: {new Date(p.fechaEntrega).toLocaleDateString("es-AR")}</span>}
                              </div>
                            </CardContent>
                          </Card>
                        </div>
                      )}
                    </Draggable>
                  );
                })}
                {provided.placeholder}
              </div>
            )}
          </Droppable>

          {/* Desktop table */}
          <Droppable droppableId="pedidos-desktop">
            {(provided) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="hidden md:block rounded-md border overflow-x-auto"
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      {canDrag && <TableHead className="w-[40px]"></TableHead>}
                      <TableHead className="w-[40px]"></TableHead>
                      <TableHead>Prioridad</TableHead>
                      <TableHead className="min-w-[120px]">Cliente</TableHead>
                      <TableHead className="min-w-[160px]">Modelos</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Entrega</TableHead>
                      <TableHead className="w-[100px]">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((p, index) => {
                      const total = calcTotal(p.items);
                      const costo = calcCosto(p.items);
                      const ganancia = total - costo;
                      const isExpanded = expandedId === p.id;
                      const prioConfig = PRIORIDADES[p.prioridad];
                      const estadoConfig = ESTADOS_PEDIDO[p.estado];
                      const liquidacionVencida =
                        p.estado === "ESPERANDO_LIQUIDACION_ML" &&
                        p.fechaLiquidacionMl &&
                        new Date(p.fechaLiquidacionMl) <= new Date();
                      const faltaLiquidacionMl =
                        p.canalVenta === "mercadolibre" &&
                        !p.fechaLiquidacionMl &&
                        p.estado !== "COMPLETADO";
                      return (
                        <Draggable key={p.id} draggableId={`desktop-${p.id}`} index={index} isDragDisabled={!canDrag}>
                          {(dragProvided, snapshot) => (
                            <>
                              <TableRow
                                ref={dragProvided.innerRef}
                                {...dragProvided.draggableProps}
                                className={`cursor-pointer hover:bg-muted/50 ${liquidacionVencida ? "bg-emerald-50 dark:bg-emerald-950/30" : ""} ${snapshot.isDragging ? "bg-muted shadow-lg" : ""}`}
                                onClick={() => setExpandedId(isExpanded ? null : p.id)}
                              >
                                {canDrag && (
                                  <TableCell className="w-[40px] px-2" onClick={(e) => e.stopPropagation()}>
                                    <div
                                      {...dragProvided.dragHandleProps}
                                      className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                      <GripVertical className="h-4 w-4" />
                                    </div>
                                  </TableCell>
                                )}
                                <TableCell className="w-[40px] px-2">
                                  <ChevronRight
                                    className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
                                  />
                                </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Select value={p.prioridad} onValueChange={(v) => v && handlePrioridadChange(p.id, v)}>
                            <SelectTrigger className="h-7 w-[110px] px-2 text-xs border-0 shadow-none bg-transparent hover:bg-muted/50 focus:ring-0">
                              <span className={`h-2 w-2 rounded-full mr-1.5 flex-shrink-0 ${prioConfig.color}`} />
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(PRIORIDADES).map(([key, val]) => (
                                <SelectItem key={key} value={key}>
                                  <span className="flex items-center gap-2">
                                    <span className={`h-2 w-2 rounded-full ${val.color}`} />
                                    {val.label}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="font-medium">
                          {p.cliente?.nombre || <span className="text-muted-foreground">Sin cliente</span>}
                        </TableCell>
                        <TableCell className="max-w-[260px]">
                          <div className="flex flex-col gap-0.5">
                            {p.items.map((item) => (
                              <div key={item.id} className="flex flex-col">
                                <span className="text-sm font-medium truncate">
                                  {item.cantidad > 1 && (
                                    <span className="text-muted-foreground mr-1">{item.cantidad}×</span>
                                  )}
                                  {item.modelo.nombre}
                                </span>
                                {item.variantesInfo && item.variantesInfo.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-0.5">
                                    {item.variantesInfo.map((v, vi) => (
                                      <Badge
                                        key={vi}
                                        variant="outline"
                                        className="text-[10px] px-1.5 py-0 border-blue-400/60 text-blue-500 dark:text-blue-400 font-normal"
                                      >
                                        {v.nombre}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">${total.toFixed(0)}</TableCell>
                        <TableCell>
                          <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-1">
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                render={<Button variant="ghost" size="sm" className="gap-1 h-7 px-2" />}
                              >
                                <span className={`h-2 w-2 rounded-full ${estadoConfig.color}`} />
                                {estadoConfig.label}
                                <ChevronDown className="h-3 w-3" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent>
                                {Object.entries(ESTADOS_PEDIDO).map(([key, val]) => (
                                  <DropdownMenuItem
                                    key={key}
                                    onClick={() => handleStatusChange(p.id, key)}
                                    className="gap-2"
                                  >
                                    <span className={`h-2 w-2 rounded-full ${val.color}`} />
                                    {val.label}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                            {faltaLiquidacionMl && (
                              <span title="Falta asignar fecha de liquidacion ML">
                                <AlertTriangle className="h-4 w-4 text-amber-500" />
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {new Date(p.fechaPedido).toLocaleDateString("es-AR")}
                        </TableCell>
                        <TableCell className="text-sm">
                          {p.fechaEntrega
                            ? new Date(p.fechaEntrega).toLocaleDateString("es-AR")
                            : "\u2014"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(p.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                              {isExpanded && (
                                <TableRow className="bg-muted/30 hover:bg-muted/30">
                                  <TableCell colSpan={canDrag ? 10 : 9} className="p-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div className="space-y-2">
                                <h4 className="font-semibold text-sm">Informacion de contacto</h4>
                                <div className="text-sm space-y-1">
                                  <p><span className="text-muted-foreground">Contacto:</span> {p.contacto || "\u2014"}</p>
                                  <p><span className="text-muted-foreground">Metodo de envio:</span> {p.metodoEnvio || "\u2014"}</p>
                                  <p><span className="text-muted-foreground">Metodo de pago:</span> {p.metodoPago || "\u2014"}</p>
                                  <p><span className="text-muted-foreground">Sena:</span> ${p.senia.toFixed(0)}</p>
                                  <p><span className="text-muted-foreground">Precio envio:</span> ${p.precioEnvio.toFixed(0)}</p>
                                  <p><span className="text-muted-foreground">Canal de venta:</span> {getCanalLabel(p.canalVenta)}</p>
                                  {p.idMercadolibre && (
                                    <p><span className="text-muted-foreground">ID MercadoLibre:</span> {p.idMercadolibre}</p>
                                  )}
                                  {p.fechaLiquidacionMl && (
                                    <p>
                                      <span className="text-muted-foreground">Liquidacion ML:</span>{" "}
                                      {new Date(p.fechaLiquidacionMl).toLocaleDateString("es-AR")}
                                      {liquidacionVencida && (
                                        <Badge className="ml-2 bg-emerald-600 text-white text-xs">Liquidado</Badge>
                                      )}
                                    </p>
                                  )}
                                </div>
                              </div>

                              <div className="space-y-2">
                                <h4 className="font-semibold text-sm">Detalle de items</h4>
                                <div className="space-y-1">
                                  {p.items.map((item) => (
                                    <div key={item.id} className="text-sm border rounded-md p-2 space-y-0.5">
                                      <p className="font-medium">{item.modelo.nombre}</p>
                                      {item.modelo.categorias.length > 0 && (
                                        <div className="flex flex-wrap gap-1">
                                          {item.modelo.categorias.map(({ categoria }) => (
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
                                      )}
                                      {item.variantesInfo && item.variantesInfo.length > 0 && (
                                        <div className="flex flex-wrap gap-1">
                                          {item.variantesInfo.map((v, vi) => (
                                            <Badge key={vi} variant="outline" className="text-[10px] px-1.5 py-0 border-blue-400 text-blue-600 dark:text-blue-400">
                                              {v.nombre}
                                              {v.precioAdicional > 0 && ` +$${v.precioAdicional.toLocaleString("es-AR")}`}
                                            </Badge>
                                          ))}
                                        </div>
                                      )}
                                      <div className="flex gap-3 text-xs text-muted-foreground">
                                        <span>Cant: {item.cantidad}</span>
                                        <span>Precio: ${item.precioUnitario.toFixed(0)}</span>
                                        <span>Costo: ${item.costoUnitario.toFixed(0)}</span>
                                        {item.ajusteManual !== 0 && (
                                          <span>Ajuste: ${item.ajusteManual.toFixed(0)}</span>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              <div className="space-y-2">
                                <h4 className="font-semibold text-sm">Notas y etiquetas</h4>
                                <div className="text-sm space-y-2">
                                  <div>
                                    <span className="text-muted-foreground">Notas:</span>
                                    <p className="whitespace-pre-wrap">{p.notas || "\u2014"}</p>
                                  </div>
                                  {p.etiquetas.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      {p.etiquetas.map((tag) => (
                                        <Badge key={tag} variant="secondary" className="text-xs">
                                          {tag}
                                        </Badge>
                                      ))}
                                    </div>
                                  )}
                                  {p.comprobanteUrl && (
                                    <div>
                                      <span className="text-muted-foreground text-sm">Comprobante:</span>
                                      <a
                                        href={p.comprobanteUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="block mt-1"
                                      >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                          src={p.comprobanteUrl}
                                          alt="Comprobante"
                                          className="max-h-24 rounded border object-cover hover:opacity-80 transition-opacity"
                                        />
                                      </a>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="mt-3 pt-3 border-t flex flex-wrap gap-4 text-sm">
                              <span><span className="text-muted-foreground">Total:</span> <strong>${total.toFixed(0)}</strong></span>
                              <span><span className="text-muted-foreground">Costo:</span> <strong>${costo.toFixed(0)}</strong></span>
                              <span><span className="text-muted-foreground">Envio:</span> <strong>${p.precioEnvio.toFixed(0)}</strong></span>
                              <span><span className="text-muted-foreground">Sena:</span> <strong>-${p.senia.toFixed(0)}</strong></span>
                              <span>
                                <span className="text-muted-foreground">Ganancia estimada:</span>{" "}
                                <strong className={ganancia >= 0 ? "text-green-600" : "text-red-500"}>
                                  ${ganancia.toFixed(0)}
                                </strong>
                              </span>
                              {p.senia > 0 && (
                                <span>
                                  <span className="text-muted-foreground">Restante a cobrar:</span>{" "}
                                  <strong>${(total + p.precioEnvio - p.senia).toFixed(0)}</strong>
                                </span>
                              )}
                            </div>
                                  </TableCell>
                                </TableRow>
                              )}
                            </>
                          )}
                        </Draggable>
                      );
                    })}
                    {provided.placeholder}
                  </TableBody>
                </Table>
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}

      <PedidoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        pedido={editingPedido}
        onSaved={handleSaved}
      />
    </div>
  );
}
