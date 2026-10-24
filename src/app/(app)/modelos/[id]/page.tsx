"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Boxes, MoreHorizontal, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { TableSkeleton } from "@/components/data-loading";
import { json, pedir, pesos } from "@/components/producto/seccion";
import { SeccionDatos } from "@/components/producto/datos";
import { SeccionPrecioCosto, margenDe } from "@/components/producto/precio-costo";
import { SeccionFotos } from "@/components/producto/fotos";
import { SeccionVariantes } from "@/components/producto/variantes";
import { SeccionLoQueSeVende } from "@/components/producto/lo-que-se-vende";
import { SeccionDondeSeVende } from "@/components/producto/donde-se-vende";
import type { Ficha } from "@/app/api/modelos/[id]/ficha/route";

/**
 * La página del producto: el único lugar donde se ve y se configura (docs/sdd/004, spec 001).
 * Cada sección se edita y se guarda sola; consolidar y eliminar están en el menú de arriba.
 */
export default function ProductoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [estado, setEstado] = useState<"cargando" | "listo" | "no-existe">("cargando");
  const [consolidando, setConsolidando] = useState(false);
  // Cada cambio guardado sube la versión y la ficha se vuelve a pedir.
  const [version, setVersion] = useState(0);
  const cargar = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let vigente = true;
    fetch(`/api/modelos/${id}/ficha`).then(async (r) => {
      if (!vigente) return;
      if (r.status === 404) return setEstado("no-existe");
      if (!r.ok) return void toast.error("No se pudo cargar el producto");
      const data: Ficha = await r.json();
      if (!vigente) return;
      setFicha(data);
      setEstado("listo");
    });
    return () => {
      vigente = false;
    };
  }, [id, version]);

  if (estado === "cargando") return <TableSkeleton cols={3} />;
  if (estado === "no-existe" || !ficha) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Package className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">Producto no encontrado</p>
        <Button variant="outline" onClick={() => router.push("/modelos")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Volver a productos
        </Button>
      </div>
    );
  }

  const p = ficha.producto;
  const margen = margenDe(p);

  async function activar(activo: boolean) {
    try {
      await pedir(`/api/modelos/${p.id}`, json("PATCH", { activo }));
      toast.success(activo ? "Producto activado" : "Producto desactivado");
      cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cambiar");
    }
  }

  async function revertir() {
    if (!confirm("¿Revertir la consolidación? El producto vuelve a aparecer en la lista.")) return;
    try {
      await pedir(`/api/modelos/${p.id}/consolidar`, { method: "DELETE" });
      toast.success("Consolidación revertida");
      cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo revertir");
    }
  }

  async function eliminar() {
    if (!confirm(`¿Eliminar "${p.nombre}"? No se puede deshacer.`)) return;
    const r = await fetch(`/api/modelos/${p.id}`, { method: "DELETE" });
    if (r.ok) {
      toast.success("Producto eliminado");
      router.push("/modelos");
      return;
    }
    const data = await r.json().catch(() => ({}));
    if (r.status === 409 && p.activo) {
      if (confirm(`${data.error ?? "No se puede eliminar"}. ¿Lo desactivo?`)) activar(false);
    } else {
      toast.error(data.error ?? "No se pudo eliminar");
    }
  }

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      {/* Encabezado */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <Button variant="ghost" size="icon" onClick={() => router.push("/modelos")} aria-label="Volver a productos">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="h-14 w-14 shrink-0 rounded-lg border bg-muted overflow-hidden flex items-center justify-center">
            {p.imagenesUrls[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.imagenesUrls[0]} alt="" className="h-full w-full object-cover" />
            ) : (
              <Package className="h-6 w-6 text-muted-foreground/40" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold truncate">{p.nombre}</h1>
              {p.esInsumo && <Badge variant="secondary">Insumo</Badge>}
              {!p.activo && !p.esInsumo && <Badge variant="secondary">Inactivo</Badge>}
            </div>
            <p className="text-sm text-muted-foreground flex flex-wrap gap-x-3">
              <span className="font-mono">{p.sku ?? "sin SKU"}</span>
              {!p.esInsumo && (
                <>
                  <span>{pesos(p.precioVenta)}</span>
                  <span>costo {pesos(p.costoFab + p.costoInsumos)}</span>
                  {margen != null && <span>margen {margen}%</span>}
                </>
              )}
            </p>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label="Más acciones" />}>
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {!p.esInsumo && <DropdownMenuItem onClick={() => activar(!p.activo)}>{p.activo ? "Desactivar" : "Activar"}</DropdownMenuItem>}
            {!p.consolidadoEn && !p.esInsumo && <DropdownMenuItem onClick={() => setConsolidando(true)}>Consolidar en otro producto…</DropdownMenuItem>}
            {p.consolidadoEn && <DropdownMenuItem onClick={revertir}>Revertir la consolidación</DropdownMenuItem>}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={eliminar} className="text-destructive">
              Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {p.consolidadoEn && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm flex flex-wrap items-center justify-between gap-2">
          <span>
            Consolidado en{" "}
            <Link href={`/modelos/${p.consolidadoEn.id}`} className="font-medium underline">
              {p.consolidadoEn.nombre}
            </Link>
            : no aparece en la lista ni en los pedidos.
          </span>
          <Button size="sm" variant="outline" onClick={revertir}>
            Revertir
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-4">
          <SeccionDatos producto={p} onCambio={cargar} />
          {!p.esInsumo && <SeccionPrecioCosto ficha={ficha} onCambio={cargar} />}
        </div>
        <SeccionFotos producto={p} onCambio={cargar} />
      </div>

      {p.esInsumo ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Boxes className="h-4 w-4" /> Usado por ({ficha.usadoPor.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {ficha.fila && (
              <p className="text-sm text-muted-foreground">
                Stock {ficha.fila.cantidad} · pieza {ficha.fila.pieza?.nombre ?? "sin enganchar"}
              </p>
            )}
            {ficha.usadoPor.map((m) => (
              <Link key={m.id} href={`/modelos/${m.id}`} className="block text-sm hover:underline">
                {m.nombre}
              </Link>
            ))}
            {ficha.usadoPor.length === 0 && <p className="text-sm text-muted-foreground">Ningún producto lo usa todavía.</p>}
          </CardContent>
        </Card>
      ) : (
        <>
          <SeccionVariantes ficha={ficha} onCambio={cargar} />
          <SeccionLoQueSeVende ficha={ficha} onCambio={cargar} />
          <SeccionDondeSeVende ficha={ficha} />
        </>
      )}

      {consolidando && <DialogoConsolidar producto={p} onCerrar={() => setConsolidando(false)} onListo={cargar} />}
    </div>
  );
}

/** Elegir en qué producto se consolida este (salió de la lista de productos). */
function DialogoConsolidar({ producto, onCerrar, onListo }: { producto: Ficha["producto"]; onCerrar: () => void; onListo: () => void }) {
  const [modelos, setModelos] = useState<Array<{ id: string; nombre: string }>>([]);
  const [busqueda, setBusqueda] = useState("");
  const [destino, setDestino] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    pedir<Array<{ id: string; nombre: string; activo: boolean; esInsumo?: boolean }>>("/api/modelos?consolidados=ocultar")
      .then((ms) => setModelos(ms.filter((m) => m.id !== producto.id && m.activo && !m.esInsumo)))
      .catch(() => setModelos([]));
  }, [producto.id]);

  const visibles = modelos.filter((m) => m.nombre.toLowerCase().includes(busqueda.trim().toLowerCase())).slice(0, 50);

  async function consolidar() {
    setGuardando(true);
    try {
      await pedir(`/api/modelos/${producto.id}/consolidar`, json("POST", { destinoId: destino }));
      toast.success("Producto consolidado");
      onListo();
      onCerrar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo consolidar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Consolidar &quot;{producto.nombre}&quot;</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Para duplicados: este deja de aparecer en la lista y en los pedidos, y sus ventas viejas siguen como estaban.
        </p>
        <Input placeholder="Buscar el producto principal…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
          {visibles.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setDestino(m.id)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-muted ${destino === m.id ? "bg-primary/10 font-medium" : ""}`}
            >
              {m.nombre}
            </button>
          ))}
          {visibles.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">Nada con ese nombre.</p>}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button disabled={!destino || guardando} onClick={consolidar}>
            Consolidar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
