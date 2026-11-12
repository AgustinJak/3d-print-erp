"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, ExternalLink, Globe, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { json, pedir, pesos } from "@/components/producto/seccion";
import type { BorradorShop, ResultadoShop } from "@/lib/crear-shop";
import type { Ficha } from "@/app/api/modelos/[id]/ficha/route";

/**
 * Crear el producto en el Shop (contrato 7c, docs/sdd/009). Como Crear en ML: el ERP arma el
 * borrador, el Shop lo revisa sin crear nada, y sólo al confirmar lo crea, **oculto**, y queda
 * mapeado. Se termina y se activa en el panel del Shop.
 */

interface Form {
  nombre: string;
  descripcion: string;
  categoriaId: string;
  peso: string;
  alto: string;
  ancho: string;
  largo: string;
  fotos: string[];
}

const numero = (s: string) => {
  const n = Number(s.replace(",", "."));
  return s.trim() && Number.isFinite(n) && n > 0 ? n : null;
};

function Formulario({ modeloId, onCerrar, onCreado }: { modeloId: string; onCerrar: () => void; onCreado: () => void }) {
  const [b, setB] = useState<BorradorShop | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState<Form | null>(null);
  const [revision, setRevision] = useState<{ clave: string; r: ResultadoShop } | null>(null);
  const [creado, setCreado] = useState<ResultadoShop | null>(null);
  const [ocupado, setOcupado] = useState<"revisando" | "creando" | null>(null);

  useEffect(() => {
    pedir<BorradorShop>(`/api/modelos/${modeloId}/crear-shop`)
      .then((x) => {
        setB(x);
        setF({
          nombre: x.nombre,
          descripcion: "",
          categoriaId: "",
          peso: x.peso ? String(x.peso) : "",
          alto: x.paquete ? String(x.paquete.alto) : "",
          ancho: x.paquete ? String(x.paquete.ancho) : "",
          largo: x.paquete ? String(x.paquete.largo) : "",
          fotos: x.fotos,
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [modeloId]);

  const pedido = useMemo(
    () =>
      f && {
        nombre: f.nombre.trim(),
        descripcion: f.descripcion.trim() || null,
        categoriaId: f.categoriaId || null,
        peso: numero(f.peso),
        alto: numero(f.alto),
        ancho: numero(f.ancho),
        largo: numero(f.largo),
        fotos: f.fotos,
      },
    [f]
  );
  const clave = JSON.stringify(pedido);
  const revisado = revision?.clave === clave ? revision.r : null;
  const listo = revisado?.respuesta.estado === "ok";

  async function mandar(simular: boolean) {
    setOcupado(simular ? "revisando" : "creando");
    try {
      const r = await pedir<ResultadoShop>(`/api/modelos/${modeloId}/crear-shop`, json("POST", { ...pedido, simular }));
      if (simular) setRevision({ clave, r });
      else if (r.respuesta.estado === "creado" || r.respuesta.estado === "ya_existe") {
        setCreado(r);
        toast.success(r.respuesta.estado === "creado" ? "Creado en el Shop, oculto." : "Ya estaba en el Shop: quedó mapeado.");
        onCreado();
      } else setRevision({ clave, r });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  }

  if (error) return <p className="text-sm text-red-600 flex gap-2"><XCircle className="h-4 w-4 mt-0.5 shrink-0" /> {error}</p>;
  if (!b || !f) return <p className="text-sm text-muted-foreground flex items-center gap-2 py-6 justify-center"><Loader2 className="h-4 w-4 animate-spin" /> Armando el borrador…</p>;

  if (creado && (creado.respuesta.estado === "creado" || creado.respuesta.estado === "ya_existe"))
    return (
      <div className="space-y-3 text-sm">
        <p className="font-medium flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          {creado.respuesta.estado === "creado" ? "Creado en el Shop, oculto" : "Ya estaba en el Shop"}: /producto/{creado.respuesta.slug}
        </p>
        <p className="text-muted-foreground">
          {creado.mapeadas} {creado.mapeadas === 1 ? "combinación quedó mapeada" : "combinaciones quedaron mapeadas"}: la primera venta de la web ya entra resuelta.
        </p>
        <p className="text-muted-foreground">En el panel del Shop: revisá la descripción, la categoría y las fotos por color, y activalo.</p>
        {creado.panel && (
          <a href={creado.panel} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
            Abrir en el panel del Shop <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
        <DialogFooter>
          <Button onClick={onCerrar}>Cerrar</Button>
        </DialogFooter>
      </div>
    );

  const set = (k: keyof Form, v: string | string[]) => setF((p) => (p ? { ...p, [k]: v } : p));
  const medida = (k: "peso" | "alto" | "ancho" | "largo", etiqueta: string) => (
    <label className="space-y-1 block">
      <span className="text-xs font-medium">{etiqueta}</span>
      <Input value={f[k]} onChange={(e) => set(k, e.target.value)} inputMode="decimal" className="h-8" />
    </label>
  );
  const ok = revisado?.respuesta.estado === "ok" ? revisado.respuesta : null;
  const errores = revisado?.respuesta.estado === "rechazado" ? revisado.respuesta.errores : [];

  return (
    <div className="space-y-4 text-sm min-w-0">
      {b.problemas.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 space-y-1">
          {b.problemas.map((p) => (
            <p key={p} className="text-xs flex gap-1.5 text-amber-800 dark:text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {p}
            </p>
          ))}
        </div>
      )}

      <label className="space-y-1 block">
        <span className="text-xs font-medium">Nombre en la web</span>
        <Input value={f.nombre} onChange={(e) => set("nombre", e.target.value)} maxLength={120} className="h-8" />
        <span className="text-xs text-muted-foreground">El link sale del nombre y no puede estar usado. Sin &quot;impresión 3D&quot;, &quot;impreso&quot;, &quot;PLA&quot; ni &quot;Sendero 3D&quot;.</span>
      </label>

      <label className="space-y-1 block">
        <span className="text-xs font-medium">
          Descripción <span className="font-normal text-muted-foreground">(opcional: si no, la escribís en el Shop)</span>
        </span>
        <Textarea value={f.descripcion} onChange={(e) => set("descripcion", e.target.value)} maxLength={5000} rows={3} />
      </label>

      <label className="space-y-1 block">
        <span className="text-xs font-medium">Categoría de la web</span>
        <select value={f.categoriaId} onChange={(e) => set("categoriaId", e.target.value)} className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm">
          <option value="">Elegirla después en el Shop</option>
          {b.categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </label>

      <div className="space-y-1">
        <p className="text-xs font-medium">
          Paquete {b.paqueteDe && <span className="font-normal text-muted-foreground">(de {b.paqueteDe}, en ML)</span>}
        </p>
        <div className="grid grid-cols-4 gap-2">
          {medida("peso", "Peso (g)")}
          {medida("alto", "Alto (cm)")}
          {medida("ancho", "Ancho (cm)")}
          {medida("largo", "Largo (cm)")}
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium">
          Variantes y precio web <span className="font-normal text-muted-foreground">(el de Precios; el Shop lo traduce a base y adicionales)</span>
        </p>
        <div className="max-h-40 overflow-y-auto rounded-md border divide-y">
          {b.combinaciones.map((c) => (
            <div key={c.combinacionId} className="px-3 py-1.5 flex items-center justify-between gap-2 text-xs">
              <span className="truncate">{c.nombre}</span>
              <span className={`tabular-nums shrink-0 ${c.precio == null ? "text-amber-700 dark:text-amber-400" : ""}`}>{c.precio == null ? c.falta : pesos(c.precio)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium">
          Fotos <span className="font-normal text-muted-foreground">(generales; las de cada color se asignan en el Shop)</span>
        </p>
        {b.fotos.length ? (
          <div className="flex flex-wrap gap-2">
            {b.fotos.map((u) => (
              <label key={u} className={`relative cursor-pointer rounded border ${f.fotos.includes(u) ? "ring-2 ring-primary" : "opacity-50"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt="" className="h-14 w-14 object-cover rounded" />
                <input type="checkbox" className="absolute top-1 left-1" checked={f.fotos.includes(u)} onChange={(e) => set("fotos", e.target.checked ? b.fotos.filter((x) => x === u || f.fotos.includes(x)) : f.fotos.filter((x) => x !== u))} />
              </label>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">El producto no tiene fotos en el ERP: las cargás en el Shop.</p>
        )}
      </div>

      {revisado && (
        <div className="rounded-md border px-3 py-2 space-y-1">
          {ok ? (
            <>
              <p className="text-xs font-medium flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> El Shop lo acepta: /producto/{ok.producto.slug}
              </p>
              <p className="text-xs text-muted-foreground">
                Precio base {pesos(ok.producto.precio_base)}
                {ok.producto.adicionales.length > 0 && ` · ${ok.producto.adicionales.length} adicionales`}
                {ok.producto.reglas.length > 0 && ` · ${ok.producto.reglas.length} ${ok.producto.reglas.length === 1 ? "regla" : "reglas"}`}
                {` · ${ok.producto.fotos.length} ${ok.producto.fotos.length === 1 ? "foto" : "fotos"}`}
              </p>
            </>
          ) : (
            <>
              <p className="text-xs font-medium flex items-center gap-1.5">
                <XCircle className="h-3.5 w-3.5 text-red-600" /> El Shop no lo acepta
              </p>
              {errores.map((e) => (
                <p key={`${e.campo}|${e.motivo}`} className="text-xs text-red-600">
                  <span className="font-mono">{e.campo}</span>: {e.motivo}
                </p>
              ))}
            </>
          )}
        </div>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onCerrar} disabled={ocupado === "creando"}>
          Cancelar
        </Button>
        <Button variant="outline" onClick={() => mandar(true)} disabled={!pedido?.nombre || b.problemas.length > 0 || !!ocupado}>
          {ocupado === "revisando" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Revisar en el Shop
        </Button>
        <Button onClick={() => mandar(false)} disabled={!listo || !!ocupado} title={!revisado ? "Primero revisá en el Shop" : undefined}>
          {ocupado === "creando" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {ocupado === "creando" ? "Creando (baja las fotos)…" : "Crear oculto"}
        </Button>
      </DialogFooter>
    </div>
  );
}

export function SeccionCrearEnShop({ ficha, onCambio }: { ficha: Ficha; onCambio: () => void }) {
  const [abierta, setAbierta] = useState(false);
  const activas = ficha.combinaciones.filter((c) => c.activo);
  // Si alguna combinación ya tiene clave del Shop, el producto ya está en la web.
  const enWeb = ficha.canales.claves.some((k) => k.canal === "shop" && k.activa);
  if (!activas.length || enWeb) return null;
  return (
    <Card>
      <CardContent className="py-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" /> Sin publicar en la web
          </p>
          <Button size="sm" variant="outline" onClick={() => setAbierta(true)}>
            Crear en el Shop
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Se crea oculto y queda mapeado, sólo cuando lo confirmás. Después lo activás en el panel del Shop.</p>
      </CardContent>
      <Dialog open={abierta} onOpenChange={setAbierta}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          {abierta && (
            <>
              <DialogHeader>
                <DialogTitle>Crear en el Shop: {ficha.producto.nombre}</DialogTitle>
                <DialogDescription>Revisá todo. No se crea nada hasta que toques &quot;Crear oculto&quot;.</DialogDescription>
              </DialogHeader>
              <Formulario modeloId={ficha.producto.id} onCerrar={() => setAbierta(false)} onCreado={onCambio} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
