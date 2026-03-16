"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Plus, Search, Pencil, Trash2, ChevronDown, ChevronRight } from "lucide-react";
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
import { TableSkeleton } from "@/components/data-loading";
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
    fetchPedidos();
  };

  const handleStatusChange = async (id: string, estado: string) => {
    await fetch(`/api/pedidos/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado }),
    });
    fetchPedidos();
  };

  const handleSaved = () => {
    setDialogOpen(false);
    fetchPedidos();
  };

  if (initialLoading) return <TableSkeleton cols={7} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Pedidos</h1>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Pedido
        </Button>
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

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]"></TableHead>
              <TableHead>Prioridad</TableHead>
              <TableHead className="min-w-[120px]">Cliente</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Entrega</TableHead>
              <TableHead className="w-[100px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  {pedidos.length === 0 ? "No hay pedidos registrados." : "Sin resultados."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => {
                const total = calcTotal(p.items);
                const costo = calcCosto(p.items);
                const ganancia = total - costo + p.precioEnvio - p.senia;
                const isExpanded = expandedId === p.id;
                const prioConfig = PRIORIDADES[p.prioridad];
                const estadoConfig = ESTADOS_PEDIDO[p.estado];
                const liquidacionVencida =
                  p.estado === "ESPERANDO_LIQUIDACION_ML" &&
                  p.fechaLiquidacionMl &&
                  new Date(p.fechaLiquidacionMl) <= new Date();
                return (
                  <React.Fragment key={p.id}>
                    <TableRow
                      className={`cursor-pointer hover:bg-muted/50 ${liquidacionVencida ? "bg-emerald-50 dark:bg-emerald-950/30" : ""}`}
                      onClick={() => setExpandedId(isExpanded ? null : p.id)}
                    >
                      <TableCell className="w-[40px] px-2">
                        <ChevronRight
                          className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="gap-1">
                          <span className={`h-2 w-2 rounded-full ${prioConfig.color}`} />
                          {prioConfig.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {p.cliente?.nombre || <span className="text-muted-foreground">Sin cliente</span>}
                      </TableCell>
                      <TableCell>
                        {p.items.length} {p.items.length === 1 ? "ítem" : "ítems"}
                      </TableCell>
                      <TableCell className="font-medium">${total.toFixed(0)}</TableCell>
                      <TableCell>
                        <div onClick={(e) => e.stopPropagation()}>
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
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {new Date(p.fechaPedido).toLocaleDateString("es-AR")}
                      </TableCell>
                      <TableCell className="text-sm">
                        {p.fechaEntrega
                          ? new Date(p.fechaEntrega).toLocaleDateString("es-AR")
                          : "—"}
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
                        <TableCell colSpan={9} className="p-4">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Left: Contact & payment info */}
                            <div className="space-y-2">
                              <h4 className="font-semibold text-sm">Información de contacto</h4>
                              <div className="text-sm space-y-1">
                                <p><span className="text-muted-foreground">Contacto:</span> {p.contacto || "—"}</p>
                                <p><span className="text-muted-foreground">Método de envío:</span> {p.metodoEnvio || "—"}</p>
                                <p><span className="text-muted-foreground">Método de pago:</span> {p.metodoPago || "—"}</p>
                                <p><span className="text-muted-foreground">Seña:</span> ${p.senia.toFixed(0)}</p>
                                <p><span className="text-muted-foreground">Precio envío:</span> ${p.precioEnvio.toFixed(0)}</p>
                                <p><span className="text-muted-foreground">Canal de venta:</span> {getCanalLabel(p.canalVenta)}</p>
                                {p.idMercadolibre && (
                                  <p><span className="text-muted-foreground">ID MercadoLibre:</span> {p.idMercadolibre}</p>
                                )}
                                {p.fechaLiquidacionMl && (
                                  <p>
                                    <span className="text-muted-foreground">Liquidación ML:</span>{" "}
                                    {new Date(p.fechaLiquidacionMl).toLocaleDateString("es-AR")}
                                    {liquidacionVencida && (
                                      <Badge className="ml-2 bg-emerald-600 text-white text-xs">Liquidado</Badge>
                                    )}
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Middle: Items detail */}
                            <div className="space-y-2">
                              <h4 className="font-semibold text-sm">Detalle de ítems</h4>
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

                            {/* Right: Notes, tags, receipt */}
                            <div className="space-y-2">
                              <h4 className="font-semibold text-sm">Notas y etiquetas</h4>
                              <div className="text-sm space-y-2">
                                <div>
                                  <span className="text-muted-foreground">Notas:</span>
                                  <p className="whitespace-pre-wrap">{p.notas || "—"}</p>
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

                          {/* Profit summary */}
                          <div className="mt-3 pt-3 border-t flex flex-wrap gap-4 text-sm">
                            <span><span className="text-muted-foreground">Total:</span> <strong>${total.toFixed(0)}</strong></span>
                            <span><span className="text-muted-foreground">Costo:</span> <strong>${costo.toFixed(0)}</strong></span>
                            <span><span className="text-muted-foreground">Envío:</span> <strong>${p.precioEnvio.toFixed(0)}</strong></span>
                            <span><span className="text-muted-foreground">Seña:</span> <strong>-${p.senia.toFixed(0)}</strong></span>
                            <span>
                              <span className="text-muted-foreground">Ganancia estimada:</span>{" "}
                              <strong className={ganancia >= 0 ? "text-green-600" : "text-red-500"}>
                                ${ganancia.toFixed(0)}
                              </strong>
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <PedidoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        pedido={editingPedido}
        onSaved={handleSaved}
      />
    </div>
  );
}
