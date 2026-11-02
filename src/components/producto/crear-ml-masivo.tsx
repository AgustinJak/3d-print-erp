"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { json, pedir, pesos } from "@/components/producto/seccion";
import type { Borrador, Creada, Revision } from "@/lib/crear-ml";

/**
 * Crear en Mercado Libre varias combinaciones a la vez desde Productos (docs/sdd/006, spec 008).
 * Cada una con su borrador del ERP; las medidas del paquete se cargan una vez para todas. Se revisa
 * cada una contra ML sin crear nada y se crean, pausadas, sólo las que pasan, al confirmar.
 */

export interface ItemACrear {
  modeloId: string;
  combinacionId: string;
  nombre: string;
}

type Fila = ItemACrear & {
  borrador?: Borrador;
  error?: string;
  revision?: Revision[];
  creadas?: Creada[];
};

export function CrearMlMasivo({ items, onCerrar, onHecho }: { items: ItemACrear[]; onCerrar: () => void; onHecho: () => void }) {
  const [filas, setFilas] = useState<Fila[]>(items);
  const [cargando, setCargando] = useState(true);
  const [paquete, setPaquete] = useState({ alto: "", ancho: "", largo: "", peso: "" });
  const [opcion2, setOpcion2] = useState(false);
  const [revisadoCon, setRevisadoCon] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<{ que: "revisando" | "creando"; hechas: number } | null>(null);

  useEffect(() => {
    let vigente = true;
    (async () => {
      const out: Fila[] = [];
      for (const it of items) {
        try {
          out.push({ ...it, borrador: await pedir<Borrador>(`/api/modelos/${it.modeloId}/crear-ml?combinacion=${it.combinacionId}`) });
        } catch (e) {
          out.push({ ...it, error: e instanceof Error ? e.message : String(e) });
        }
        if (vigente) setFilas([...out, ...items.slice(out.length)]);
      }
      if (vigente) setCargando(false);
    })();
    return () => {
      vigente = false;
    };
  }, [items]);

  const n = (s: string) => Number(s.replace(",", "."));
  const paq = { alto: n(paquete.alto), ancho: n(paquete.ancho), largo: n(paquete.largo), peso: n(paquete.peso) };
  const paqueteOk = Object.values(paq).every((x) => x > 0);
  const clave = JSON.stringify({ paq, opcion2 });
  const pedidoDe = (f: Fila) => {
    const b = f.borrador!;
    const con2 = opcion2 && b.recomendarOpcion2 && !!b.opcion2;
    return {
      combinacionId: f.combinacionId,
      nombre: b.nombre,
      categoria: b.categoria?.id ?? "",
      precio1: b.opcion1.precio,
      opcion2: con2,
      precio2: con2 ? b.opcion2!.precio : null,
      paquete: paq,
      stock: b.stock,
      fotos: b.fotos.slice(0, 6),
    };
  };
  const listas = filas.filter((f) => f.borrador && f.borrador.categoria);
  const aptas = revisadoCon === clave ? filas.filter((f) => f.revision && f.revision.every((r) => !r.errores.length) && !f.creadas) : [];

  async function revisar() {
    setOcupado({ que: "revisando", hechas: 0 });
    const out = [...filas];
    for (let i = 0; i < out.length; i++) {
      const f = out[i];
      if (!f.borrador || !f.borrador.categoria) continue;
      try {
        const r = await pedir<{ revisiones: Revision[] }>(`/api/modelos/${f.modeloId}/crear-ml`, json("POST", pedidoDe(f)));
        out[i] = { ...f, revision: r.revisiones };
      } catch (e) {
        out[i] = { ...f, revision: [{ opcion: 1, errores: [e instanceof Error ? e.message : String(e)], avisos: [] }] };
      }
      setFilas([...out]);
      setOcupado({ que: "revisando", hechas: i + 1 });
    }
    setRevisadoCon(clave);
    setOcupado(null);
  }

  async function crear() {
    setOcupado({ que: "creando", hechas: 0 });
    const out = [...filas];
    let hechas = 0;
    for (let i = 0; i < out.length; i++) {
      const f = out[i];
      if (!aptas.includes(f)) continue;
      try {
        const r = await pedir<{ creadas: Creada[] }>(`/api/modelos/${f.modeloId}/crear-ml`, json("POST", { ...pedidoDe(f), aplicar: true }));
        out[i] = { ...f, creadas: r.creadas };
      } catch (e) {
        out[i] = { ...f, creadas: [{ opcion: 1, mla: null, estado: "error", pausada: false, link: null, motivo: e instanceof Error ? e.message : String(e) }] };
      }
      hechas++;
      setFilas([...out]);
      setOcupado({ que: "creando", hechas });
    }
    setOcupado(null);
    const ok = out.flatMap((f) => f.creadas ?? []).filter((c) => c.estado === "creada").length;
    if (ok) toast.success(`${ok} ${ok === 1 ? "publicación creada" : "publicaciones creadas"} en ML, pausadas.`);
    onHecho();
  }

  const creadasAlguna = filas.some((f) => f.creadas);
  return (
    <div className="space-y-4 text-sm">
      <div className="space-y-1">
        <p className="text-xs font-medium">Paquete, para todas (lo que ML usa para el envío; después se corrige en ML)</p>
        <div className="grid grid-cols-4 gap-2">
          {(["alto", "ancho", "largo", "peso"] as const).map((k) => (
            <label key={k} className="space-y-1">
              <span className="text-xs capitalize">
                {k} <span className="text-muted-foreground">{k === "peso" ? "g" : "cm"}</span>
              </span>
              <Input value={paquete[k]} onChange={(e) => setPaquete((p) => ({ ...p, [k]: e.target.value }))} inputMode="decimal" className="h-8" disabled={!!ocupado || creadasAlguna} />
            </label>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
          <input type="checkbox" checked={opcion2} onChange={(e) => setOpcion2(e.target.checked)} disabled={!!ocupado || creadasAlguna} />
          Crear también la opción 2 (3 cuotas y envío gratis) donde no sale más del doble que la 1
        </label>
      </div>

      <div className="max-h-[45vh] overflow-y-auto rounded-md border divide-y">
        {filas.map((f) => {
          const b = f.borrador;
          const errores = f.revision?.flatMap((r) => r.errores) ?? [];
          const avisos = f.revision?.flatMap((r) => r.avisos) ?? [];
          return (
            <div key={f.combinacionId} className="px-3 py-2 space-y-0.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium truncate">{f.nombre}</span>
                {f.creadas ? (
                  <span className="text-xs shrink-0">
                    {f.creadas.map((c) =>
                      c.estado === "creada" ? (
                        <a key={c.opcion} href={c.link ?? "#"} target="_blank" rel="noreferrer" className="text-emerald-600 inline-flex items-center gap-1 ml-2">
                          <CheckCircle2 className="h-3.5 w-3.5" /> {c.mla} <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span key={c.opcion} className="text-red-600 ml-2">no se creó</span>
                      )
                    )}
                  </span>
                ) : f.revision ? (
                  errores.length ? <XCircle className="h-4 w-4 text-red-600 shrink-0" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                ) : !b && !f.error ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                ) : null}
              </div>
              {f.error && <p className="text-xs text-red-600">{f.error}</p>}
              {b && (
                <p className="text-xs text-muted-foreground">
                  {b.categoria ? b.categoria.nombre : <span className="text-red-600">sin categoría: elegila en su página</span>} · opción 1 {pesos(b.opcion1.precio)} (deja {pesos(b.opcion1.ganancia)})
                  {opcion2 && b.opcion2 && (b.recomendarOpcion2 ? ` · opción 2 ${pesos(b.opcion2.precio)}` : " · sin opción 2 (más del doble)")} · {b.fotos.length} {b.fotos.length === 1 ? "foto" : "fotos"}
                </p>
              )}
              {errores.map((e) => (
                <p key={e} className="text-xs text-red-600">{e}</p>
              ))}
              {!errores.length &&
                avisos.slice(0, 2).map((a) => (
                  <p key={a} className="text-xs text-muted-foreground flex gap-1">
                    <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /> {a}
                  </p>
                ))}
              {f.creadas?.map((c) => c.motivo && <p key={c.opcion} className="text-xs text-amber-700">{c.motivo}</p>)}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        {creadasAlguna
          ? "Quedaron pausadas y enlazadas. Fotos, título y descripción se terminan en ML."
          : revisadoCon === clave
            ? `${aptas.length} de ${filas.length} se pueden crear. Las que no, dicen por qué (sin foto, sin categoría, sin costo).`
            : "Primero revisá en ML: no crea nada."}
      </p>

      <DialogFooter>
        <Button variant="outline" onClick={onCerrar} disabled={!!ocupado}>
          {creadasAlguna ? "Cerrar" : "Cancelar"}
        </Button>
        {!creadasAlguna && (
          <>
            <Button variant="outline" onClick={revisar} disabled={cargando || !paqueteOk || !listas.length || !!ocupado}>
              {ocupado?.que === "revisando" ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> {ocupado.hechas} de {filas.length}
                </>
              ) : (
                "Revisar en ML"
              )}
            </Button>
            <Button onClick={crear} disabled={!aptas.length || !!ocupado}>
              {ocupado?.que === "creando" ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> {ocupado.hechas} de {aptas.length}
                </>
              ) : (
                `Crear ${aptas.length} pausadas`
              )}
            </Button>
          </>
        )}
      </DialogFooter>
    </div>
  );
}
