"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, Store, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { json, pedir, pesos } from "@/components/producto/seccion";
import type { Borrador, Creada, Revision } from "@/lib/crear-ml";
import type { Ficha } from "@/app/api/modelos/[id]/ficha/route";

/**
 * Crear en Mercado Libre las combinaciones que no están publicadas (docs/sdd/006, spec 008).
 * Nunca automático: borrador que propone el ERP, revisión contra ML sin crear nada, y la creación
 * sólo al confirmar. Queda pausada y enlazada; fotos, título y descripción se terminan en ML.
 */

interface Form {
  nombre: string;
  precio1: string;
  opcion2: boolean;
  precio2: string;
  alto: string;
  ancho: string;
  largo: string;
  peso: string;
  stock: string;
  fotos: string[];
}

function Formulario({ modeloId, combinacionId, onCerrar, onCreada }: { modeloId: string; combinacionId: string; onCerrar: () => void; onCreada: () => void }) {
  const [b, setB] = useState<Borrador | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState<Form | null>(null);
  const [revision, setRevision] = useState<{ clave: string; r: Revision[] } | null>(null);
  const [creadas, setCreadas] = useState<Creada[] | null>(null);
  const [ocupado, setOcupado] = useState<"revisando" | "creando" | null>(null);

  useEffect(() => {
    pedir<Borrador>(`/api/modelos/${modeloId}/crear-ml?combinacion=${combinacionId}`)
      .then((x) => {
        setB(x);
        setF({
          nombre: x.nombre,
          precio1: String(x.opcion1.precio),
          opcion2: x.recomendarOpcion2,
          precio2: x.opcion2 ? String(x.opcion2.precio) : "",
          alto: "",
          ancho: "",
          largo: "",
          peso: x.peso ? String(Math.round(x.peso + 30)) : "",
          stock: String(x.stock),
          fotos: x.fotos.slice(0, 6),
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [modeloId, combinacionId]);

  const pedido = useMemo(() => {
    if (!f || !b?.categoria) return null;
    const n = (s: string) => Number(s.replace(",", "."));
    return {
      combinacionId,
      nombre: f.nombre.trim(),
      categoria: b.categoria.id,
      precio1: n(f.precio1),
      opcion2: f.opcion2,
      precio2: f.opcion2 ? n(f.precio2) : null,
      paquete: { alto: n(f.alto), ancho: n(f.ancho), largo: n(f.largo), peso: n(f.peso) },
      stock: Math.floor(n(f.stock)),
      fotos: f.fotos,
    };
  }, [f, b, combinacionId]);
  const clave = JSON.stringify(pedido);
  const revisado = revision?.clave === clave;
  const sinErrores = revisado && revision!.r.every((x) => !x.errores.length);

  async function revisar() {
    setOcupado("revisando");
    try {
      const r = await pedir<{ revisiones: Revision[] }>(`/api/modelos/${modeloId}/crear-ml`, json("POST", pedido));
      setRevision({ clave, r: r.revisiones });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  }

  async function crear() {
    setOcupado("creando");
    try {
      const r = await pedir<{ creadas: Creada[] }>(`/api/modelos/${modeloId}/crear-ml`, json("POST", { ...pedido, aplicar: true }));
      setCreadas(r.creadas);
      if (r.creadas.some((c) => c.estado === "creada")) toast.success("Creada en Mercado Libre, pausada.");
      onCreada();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  }

  if (error) return <p className="text-sm text-red-600 flex gap-2"><XCircle className="h-4 w-4 mt-0.5 shrink-0" /> {error}</p>;
  if (!b || !f) return <p className="text-sm text-muted-foreground flex items-center gap-2 py-6 justify-center"><Loader2 className="h-4 w-4 animate-spin" /> Armando el borrador…</p>;

  if (creadas)
    return (
      <div className="space-y-3">
        {creadas.map((c) => (
          <div key={c.opcion} className="rounded-md border px-3 py-2 text-sm">
            <p className="font-medium flex items-center gap-2">
              {c.estado === "creada" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
              Opción {c.opcion}: {c.estado === "creada" ? `${c.mla}${c.pausada ? " · pausada" : ""}` : "no se creó"}
            </p>
            {c.motivo && <p className="text-xs text-muted-foreground">{c.motivo}</p>}
            {c.link && (
              <a href={c.link} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                Abrir en Mercado Libre para terminarla <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        ))}
        <p className="text-xs text-muted-foreground">Quedó enlazada al producto. Fotos, título y descripción se terminan en ML; el precio, el stock y Flex se manejan desde el ERP.</p>
        <DialogFooter>
          <Button onClick={onCerrar}>Cerrar</Button>
        </DialogFooter>
      </div>
    );

  const set = (k: keyof Form, v: string | boolean | string[]) => setF((p) => (p ? { ...p, [k]: v } : p));
  const campo = (k: "precio1" | "precio2" | "alto" | "ancho" | "largo" | "peso" | "stock", etiqueta: string, ayuda?: string) => (
    <label className="space-y-1 block">
      <span className="text-xs font-medium">
        {etiqueta} {ayuda && <span className="font-normal text-muted-foreground">{ayuda}</span>}
      </span>
      <Input value={f[k]} onChange={(e) => set(k, e.target.value)} inputMode="decimal" className="h-8" />
    </label>
  );

  return (
    <div className="space-y-4 text-sm">
      <label className="space-y-1 block">
        <span className="text-xs font-medium">Nombre en ML</span>
        <Input value={f.nombre} onChange={(e) => set("nombre", e.target.value)} maxLength={60} className="h-8" />
        <span className="text-xs text-muted-foreground">Sin &quot;impresión 3D&quot;, &quot;PLA&quot;, &quot;Sendero 3D&quot;, &quot;réplica&quot;, &quot;tipo&quot; ni &quot;símil&quot;. Lo terminás en ML.</span>
      </label>

      <div className="text-xs text-muted-foreground">
        Categoría: {b.categoria ? <span className="text-foreground">{b.categoria.nombre}{b.categoria.comision != null ? ` (comisión ${String(b.categoria.comision).replace(".", ",")} %)` : ""}</span> : <span className="text-red-600">sin categoría: elegila en Política de precio</span>} · costo {pesos(b.costo)}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          {campo("precio1", "Opción 1: Clásica, sin cuotas", "(publicado)")}
          <p className="text-xs text-muted-foreground">
            Con la promo paga {pesos(b.opcion1.paga)} y te deja {pesos(b.opcion1.ganancia)} ({String(b.opcion1.margen).replace(".", ",")} %)
          </p>
        </div>
        <div className="space-y-1">
          <label className="flex items-center gap-2 text-xs font-medium">
            <input type="checkbox" checked={f.opcion2} onChange={(e) => set("opcion2", e.target.checked)} disabled={!b.opcion2} /> Opción 2: 3 cuotas y envío gratis
          </label>
          {f.opcion2 && campo("precio2", "Precio", "(publicado)")}
          {b.opcion2 && (
            <p className={`text-xs ${b.recomendarOpcion2 ? "text-muted-foreground" : "text-amber-700 dark:text-amber-400"}`}>
              {pesos(b.opcion2.precio)} deja {pesos(b.opcion2.ganancia)}
              {b.opcion2.envioEstimado ? " (envío estimado)" : ""}
              {!b.recomendarOpcion2 && ": más del doble que la opción 1, no se va a vender"}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium">Paquete (lo que ML usa para el envío)</p>
        <div className="grid grid-cols-4 gap-2">
          {campo("alto", "Alto", "cm")}
          {campo("ancho", "Ancho", "cm")}
          {campo("largo", "Largo", "cm")}
          {campo("peso", "Peso", "g")}
        </div>
      </div>

      <div className="grid grid-cols-[100px_1fr] gap-3 items-start">
        {campo("stock", "Stock")}
        <div className="space-y-1">
          <p className="text-xs font-medium">Fotos (del producto en el ERP)</p>
          {b.fotos.length ? (
            <div className="flex flex-wrap gap-2">
              {b.fotos.map((u) => (
                <label key={u} className={`relative cursor-pointer rounded border ${f.fotos.includes(u) ? "ring-2 ring-primary" : "opacity-50"}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="" className="h-14 w-14 object-cover rounded" />
                  <input type="checkbox" className="absolute top-1 left-1" checked={f.fotos.includes(u)} onChange={(e) => set("fotos", e.target.checked ? [...f.fotos, u] : f.fotos.filter((x) => x !== u))} />
                </label>
              ))}
            </div>
          ) : (
            <p className="text-xs text-red-600">El producto no tiene fotos: subí al menos una en la sección Fotos. Sin foto ML no deja crear.</p>
          )}
        </div>
      </div>

      {revisado && (
        <div className="space-y-2">
          {revision!.r.map((r) => (
            <div key={r.opcion} className="rounded-md border px-3 py-2 space-y-1">
              <p className="text-xs font-medium flex items-center gap-1.5">
                {r.errores.length ? <XCircle className="h-3.5 w-3.5 text-red-600" /> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                Opción {r.opcion}: {r.errores.length ? "no se puede crear" : "ML la acepta"}
              </p>
              {r.errores.map((e) => (
                <p key={e} className="text-xs text-red-600">{e}</p>
              ))}
              {r.avisos.map((a) => (
                <p key={a} className="text-xs text-muted-foreground flex gap-1.5">
                  <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /> {a}
                </p>
              ))}
            </div>
          ))}
          {sinErrores && <p className="text-xs text-muted-foreground">Los avisos de envío no frenan la creación (probado con el Dumpling).</p>}
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onCerrar} disabled={ocupado === "creando"}>
          Cancelar
        </Button>
        <Button variant="outline" onClick={revisar} disabled={!pedido || !!ocupado}>
          {ocupado === "revisando" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Revisar en ML
        </Button>
        <Button onClick={crear} disabled={!sinErrores || !!ocupado} title={!revisado ? "Primero revisá en ML" : undefined}>
          {ocupado === "creando" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Crear pausada
        </Button>
      </DialogFooter>
    </div>
  );
}

export function SeccionCrearEnMl({ ficha, onCambio }: { ficha: Ficha; onCambio: () => void }) {
  const [abierta, setAbierta] = useState<{ id: string; nombre: string } | null>(null);
  const conMl = new Set(ficha.canales.claves.filter((k) => k.canal === "mercadolibre" && k.activa).map((k) => k.combinacion));
  const sinPublicar = ficha.combinaciones.filter((c) => c.activo && c.precios && !conMl.has(c.nombre));
  if (!sinPublicar.length) return null;
  return (
    <Card>
      <CardContent className="py-4 space-y-3">
        <p className="font-medium flex items-center gap-2">
          <Store className="h-4 w-4 text-primary" /> Sin publicar en Mercado Libre
        </p>
        <div className="divide-y text-sm">
          {sinPublicar.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2 py-2">
              <span>
                {c.nombre} <span className="text-xs text-muted-foreground">· publicaría {pesos(c.precios!.mlPublicado)}</span>
              </span>
              <Button size="sm" variant="outline" onClick={() => setAbierta({ id: c.id, nombre: c.nombre })}>
                Crear en ML
              </Button>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Se crea pausada y enlazada, sólo cuando lo confirmás. Después la terminás en ML.</p>
      </CardContent>
      <Dialog open={!!abierta} onOpenChange={(o) => !o && setAbierta(null)}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          {abierta && (
            <>
              <DialogHeader>
                <DialogTitle>Crear en Mercado Libre: {abierta.nombre}</DialogTitle>
                <DialogDescription>Revisá todo. No se crea nada hasta que toques &quot;Crear pausada&quot;.</DialogDescription>
              </DialogHeader>
              <Formulario modeloId={ficha.producto.id} combinacionId={abierta.id} onCerrar={() => setAbierta(null)} onCreada={onCambio} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
