"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CategoriasMultiples, type Categoria } from "@/components/producto/categorias";
import { Dato, json, pedir, Seccion } from "@/components/producto/seccion";
import type { Ficha } from "@/app/api/modelos/[id]/ficha/route";

interface Valores {
  nombre: string;
  sku: string;
  serie: string;
  categoriaIds: string[];
  pesoGr: string;
  notas: string;
}

const desde = (p: Ficha["producto"]): Valores => ({
  nombre: p.nombre,
  sku: p.sku ?? "",
  serie: p.serie ?? "",
  categoriaIds: p.categorias.map((c) => c.id),
  pesoGr: p.pesoGr != null ? String(p.pesoGr) : "",
  notas: p.notas ?? "",
});

/** Datos: nombre, SKU, serie, categorías, peso y notas (docs/sdd/004, spec 002, REQ-1). */
export function SeccionDatos({ producto, onCambio }: { producto: Ficha["producto"]; onCambio: () => void }) {
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [v, setV] = useState<Valores>(() => desde(producto));
  const [categorias, setCategorias] = useState<Categoria[]>([]);

  useEffect(() => {
    if (!editando || categorias.length) return;
    pedir<Categoria[]>("/api/categorias").then(setCategorias).catch(() => setCategorias([]));
  }, [editando, categorias.length]);

  const original = desde(producto);
  const sucio = editando && JSON.stringify(v) !== JSON.stringify(original);
  const cambiar = <K extends keyof Valores>(k: K, x: Valores[K]) => setV((prev) => ({ ...prev, [k]: x }));

  async function generarSku() {
    // El SKU lo genera el inventario con la serie y la primera categoría elegida.
    const categoria = categorias.find((c) => v.categoriaIds.includes(c.id))?.nombre ?? "";
    try {
      const r = await pedir<{ sku: string | null; falta?: string }>(`/api/modelos/skus?${new URLSearchParams({ serie: v.serie, categoria })}`);
      if (r.sku) cambiar("sku", r.sku);
      else toast.error(`Para generar el SKU falta: ${r.falta}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar");
    }
  }

  async function guardar() {
    setGuardando(true);
    try {
      await pedir(`/api/modelos/${producto.id}`, json("PATCH", v));
      toast.success("Datos guardados");
      setEditando(false);
      onCambio();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Seccion
      titulo="Datos"
      icono={FileText}
      editando={editando}
      sucio={sucio}
      guardando={guardando}
      onEditar={() => {
        setV(desde(producto));
        setEditando(true);
      }}
      onCancelar={() => setEditando(false)}
      onGuardar={guardar}
    >
      {editando ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="d-nombre">Nombre</Label>
            <Input id="d-nombre" value={v.nombre} onChange={(e) => cambiar("nombre", e.target.value)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="d-serie">Serie</Label>
              <Input id="d-serie" value={v.serie} placeholder="Demon Slayer, One Piece…" onChange={(e) => cambiar("serie", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-peso">Peso (g)</Label>
              <Input id="d-peso" inputMode="decimal" value={v.pesoGr} onChange={(e) => cambiar("pesoGr", e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Categorías</Label>
            <CategoriasMultiples categorias={categorias} elegidas={v.categoriaIds} onChange={(ids) => cambiar("categoriaIds", ids)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="d-sku">
              SKU <span className="text-xs text-muted-foreground font-normal">(lo genera el inventario; no hace falta para vender)</span>
            </Label>
            <div className="flex gap-2">
              <Input id="d-sku" value={v.sku} placeholder="SS-SER-CAT-001" className="font-mono" onChange={(e) => cambiar("sku", e.target.value)} />
              <Button type="button" variant="outline" onClick={generarSku}>
                Generar
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="d-notas">Notas</Label>
            <Textarea id="d-notas" rows={2} value={v.notas} onChange={(e) => cambiar("notas", e.target.value)} />
          </div>
        </div>
      ) : (
        <div className="divide-y">
          <Dato etiqueta="SKU">{producto.sku ? <span className="font-mono text-xs">{producto.sku}</span> : <span className="text-amber-600">sin SKU</span>}</Dato>
          <Dato etiqueta="Serie">{producto.serie ?? "—"}</Dato>
          <Dato etiqueta="Categorías">
            {producto.categorias.length ? (
              <span className="flex flex-wrap justify-end gap-1">
                {producto.categorias.map((c) => (
                  <Badge key={c.id} variant="secondary" style={c.color ? { backgroundColor: c.color, color: "#fff" } : undefined}>
                    {c.nombre}
                  </Badge>
                ))}
              </span>
            ) : (
              "—"
            )}
          </Dato>
          {producto.pesoGr != null && <Dato etiqueta="Peso">{producto.pesoGr} g</Dato>}
          {producto.notas && <Dato etiqueta="Notas">{producto.notas}</Dato>}
        </div>
      )}
    </Seccion>
  );
}
