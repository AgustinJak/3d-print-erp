"use client";

import { useEffect, useState, useCallback } from "react";
import { Factory, Clock, ChevronDown, Inbox, GripVertical } from "lucide-react";
import { toast } from "sonner";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TableSkeleton } from "@/components/data-loading";
import { EmptyState } from "@/components/empty-state";
import { ESTADOS_PEDIDO, PRIORIDADES } from "@/lib/constants";
import { useDatosEnVivo } from "@/hooks/use-datos-en-vivo";

interface VarianteInfo {
  nombre: string;
  precioAdicional: number;
  costoFabAdicional?: number;
}

interface ItemPedido {
  id: string;
  cantidad: number;
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
  estado: keyof typeof ESTADOS_PEDIDO;
  fechaEntrega: string | null;
  notas: string | null;
  cliente: { id: string; nombre: string } | null;
  items: ItemPedido[];
}

export default function ProduccionPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);

  const fetchPedidos = useCallback(async () => {
    const res = await fetch("/api/produccion");
    setPedidos(await res.json());
    setInitialLoading(false);
  }, []);

  useEffect(() => { fetchPedidos(); }, [fetchPedidos]);
  // La cola se reordena sola cuando entra un pedido nuevo.
  useDatosEnVivo(fetchPedidos);

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

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination || result.source.index === result.destination.index) return;

    const reordered = Array.from(pedidos);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);

    // Optimistic update
    setPedidos(reordered);

    try {
      await fetch("/api/produccion/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orden: reordered.map((p) => p.id) }),
      });
      toast.success("Orden actualizado");
    } catch {
      toast.error("Error al reordenar");
      fetchPedidos(); // Revert
    }
  };

  if (initialLoading) return <TableSkeleton cols={4} />;

  // Agrupar items para ver qué hay que imprimir
  const itemsAgrupados = new Map<string, {
    nombre: string;
    cantidad: number;
    pedidos: string[];
    categorias: Array<{ categoria: { id: string; nombre: string; color: string | null } }>;
  }>();
  pedidos.forEach((p) => {
    p.items.forEach((item) => {
      const key = item.modelo.id;
      const existing = itemsAgrupados.get(key);
      if (existing) {
        existing.cantidad += item.cantidad;
        existing.pedidos.push(p.id.slice(-6));
      } else {
        itemsAgrupados.set(key, {
          nombre: item.modelo.nombre,
          cantidad: item.cantidad,
          pedidos: [p.id.slice(-6)],
          categorias: item.modelo.categorias,
        });
      }
    });
  });

  const totalItems = Array.from(itemsAgrupados.values()).reduce((s, i) => s + i.cantidad, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">Cola de Producción</h1>
        <div className="flex gap-3">
          <Badge variant="outline" className="text-sm py-1 px-3">
            <Factory className="mr-1 h-4 w-4" />
            {pedidos.length} {pedidos.length === 1 ? "pedido" : "pedidos"}
          </Badge>
          <Badge variant="outline" className="text-sm py-1 px-3">
            {totalItems} {totalItems === 1 ? "pieza" : "piezas"} a imprimir
          </Badge>
        </div>
      </div>

      {/* Resumen de piezas a imprimir */}
      {itemsAgrupados.size > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Resumen de impresión</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2">
              {Array.from(itemsAgrupados.values())
                .sort((a, b) => b.cantidad - a.cantidad)
                .map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between rounded-md border px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{item.nombre}</span>
                      {item.categorias.length > 0 && (
                        <div className="flex gap-1">
                          {item.categorias.map(({ categoria }) => (
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
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground">
                        Pedidos: {item.pedidos.join(", ")}
                      </span>
                      <Badge variant="default">{item.cantidad}x</Badge>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista de pedidos en producción */}
      {pedidos.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Cola de produccion vacia"
          description="No hay pedidos en produccion. Cuando confirmes un pedido, aparecera aca para imprimir."
        />
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="produccion">
            {(provided) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="grid grid-cols-1 gap-3"
              >
                {pedidos.map((p, index) => {
                  const prioConfig = PRIORIDADES[p.prioridad];
                  const estadoConfig = ESTADOS_PEDIDO[p.estado];
                  const diasRestantes = p.fechaEntrega
                    ? (() => {
                        const entrega = new Date(p.fechaEntrega);
                        const hoy = new Date();
                        entrega.setHours(0, 0, 0, 0);
                        hoy.setHours(0, 0, 0, 0);
                        return Math.round((entrega.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
                      })()
                    : null;

                  return (
                    <Draggable key={p.id} draggableId={p.id} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={snapshot.isDragging ? "opacity-90" : ""}
                        >
                          <Card className={`${p.prioridad === "URGENTE" ? "border-red-500 border-2 bg-red-500/5" : ""} ${snapshot.isDragging ? "ring-2 ring-primary shadow-lg" : ""}`}>
                            <CardContent className="pt-4">
                              <div className="flex items-start gap-3">
                                {/* Drag handle */}
                                <div
                                  {...provided.dragHandleProps}
                                  className="mt-1 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  <GripVertical className="h-5 w-5" />
                                </div>

                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between mb-3">
                                    <div className="space-y-1">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <Badge variant="outline" className="text-xs text-muted-foreground">
                                          #{index + 1}
                                        </Badge>
                                        <Badge variant="outline" className="gap-1">
                                          <span className={`h-2 w-2 rounded-full ${prioConfig.color}`} />
                                          {prioConfig.label}
                                        </Badge>
                                        <span className="text-sm text-muted-foreground">#{p.id.slice(-6)}</span>
                                      </div>
                                      <p className="font-medium">
                                        {p.cliente?.nombre || "Sin cliente"}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {diasRestantes !== null && (
                                        <Badge
                                          variant={diasRestantes < 0 ? "destructive" : diasRestantes === 0 ? "destructive" : diasRestantes <= 3 ? "default" : "outline"}
                                          className="gap-1"
                                        >
                                          <Clock className="h-3 w-3" />
                                          {diasRestantes < 0
                                            ? "Vencido"
                                            : diasRestantes === 0
                                              ? "Hoy"
                                              : `${diasRestantes}d restantes`}
                                        </Badge>
                                      )}
                                      <DropdownMenu>
                                        <DropdownMenuTrigger
                                          render={<Button variant="outline" size="sm" className="gap-1" />}
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
                                  </div>

                                  <div className="space-y-1">
                                    {p.items.map((item) => (
                                      <div key={item.id} className="space-y-0.5">
                                        <div className="flex items-center gap-2 text-sm flex-wrap">
                                          <span className="font-medium">{item.cantidad}x</span>
                                          <span>{item.modelo.nombre}</span>
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
                                        {item.variantesInfo && item.variantesInfo.length > 0 && (
                                          <div className="flex flex-wrap gap-1 ml-7">
                                            {item.variantesInfo.map((v, vi) => (
                                              <Badge key={vi} variant="outline" className="text-[10px] px-1.5 py-0 border-blue-400 text-blue-600 dark:text-blue-400">
                                                {v.nombre}
                                              </Badge>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>

                                  {p.notas && (
                                    <p className="mt-2 text-sm text-muted-foreground border-t pt-2">{p.notas}</p>
                                  )}
                                </div>
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
        </DragDropContext>
      )}
    </div>
  );
}
