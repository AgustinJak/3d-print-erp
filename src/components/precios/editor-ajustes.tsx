"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmentado } from "@/components/segmentado";
import { EtiquetaAjuste } from "@/components/precios/etiqueta-ajuste";
import { json, pedir, pesos } from "@/components/producto/seccion";
import { NOMBRE_CANAL, validarAjuste, type CanalAjuste, type TipoAjuste } from "@/lib/ajustes-precio-reglas";
import type { AjusteGuardado } from "@/lib/ajustes-precio";
import type { FilaVistaPrevia } from "@/lib/ajustes-precio-vista";
import { parsePrice } from "@/lib/utils";

/**
 * El editor de ajustes de precio (docs/sdd/015): un % por canal o un envío propio, con fecha de fin
 * y nota, para un producto o para varios. Antes de guardar se ve cómo quedan los precios (RN-5).
 * Nada de esto publica: cambia lo que Precios propone.
 */

interface Borrador {
  canal: CanalAjuste;
  tipo: TipoAjuste;
  valor: string;
  hasta: string;
  nota: string;
}

const NUEVO: Borrador = { canal: "web", tipo: "porcentaje", valor: "", hasta: "", nota: "" };
const fechaInput = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }) : "");
/** La fecha de fin es el final de ese día en Argentina. */
const finDelDia = (d: string) => (d ? new Date(`${d}T23:59:59-03:00`).toISOString() : null);

export function EditorAjustes({ modeloIds, ajustes = [], onGuardado }: { modeloIds: string[]; ajustes?: AjusteGuardado[]; onGuardado: () => void }) {
  const varios = modeloIds.length > 1;
  const [b, setB] = useState<Borrador | null>(varios ? NUEVO : null);
  const [vista, setVista] = useState<FilaVistaPrevia[] | null>(null);
  const [ocupado, setOcupado] = useState<null | "viendo" | "guardando" | string>(null);

  const cuerpo = (x: Borrador) => ({
    modeloIds,
    canal: x.canal,
    tipo: x.tipo,
    valor: x.valor.trim() ? parsePrice(x.valor) : NaN,
    hasta: finDelDia(x.hasta),
    nota: x.nota.trim() || null,
  });
  const error = b ? validarAjuste(cuerpo(b)) : null;

  const cambiar = (c: Partial<Borrador>) => {
    setB((x) => (x ? { ...x, ...c, ...(c.canal === "personalizado" ? { tipo: "porcentaje" as const } : {}) } : x));
    setVista(null);
  };

  async function verComoQueda() {
    if (!b || error) return;
    setOcupado("viendo");
    try {
      const r = await pedir<{ filas: FilaVistaPrevia[] }>("/api/precios/ajustes/vista-previa", json("POST", cuerpo(b)));
      setVista(r.filas);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo calcular");
    } finally {
      setOcupado(null);
    }
  }

  async function guardar() {
    if (!b || error) return;
    setOcupado("guardando");
    try {
      await pedir("/api/precios/ajustes", json("PUT", cuerpo(b)));
      toast.success(varios ? `Ajuste guardado en ${modeloIds.length} productos` : "Ajuste guardado");
      setB(varios ? NUEVO : null);
      setVista(null);
      onGuardado();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setOcupado(null);
    }
  }

  async function borrar(a: Pick<AjusteGuardado, "canal" | "tipo">) {
    const clave = `${a.canal}-${a.tipo}`;
    setOcupado(clave);
    try {
      await pedir("/api/precios/ajustes", json("DELETE", { modeloIds, canal: a.canal, tipo: a.tipo }));
      toast.success("Ajuste sacado");
      onGuardado();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo sacar");
    } finally {
      setOcupado(null);
    }
  }

  const editar = (a: AjusteGuardado) => {
    setB({ canal: a.canal, tipo: a.tipo, valor: String(a.valor), hasta: fechaInput(a.hasta), nota: a.nota ?? "" });
    setVista(null);
  };

  const canalAfectado = b?.canal === "ml" ? "ml" : b?.canal === "web" ? "web" : "personalizado";

  return (
    <div className="space-y-3">
      {!varios && ajustes.length > 0 && (
        <ul className="space-y-1.5">
          {ajustes.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <EtiquetaAjuste a={a} nota={false} />
                {a.nota && <span className="ml-2 text-xs text-muted-foreground">{a.nota}</span>}
              </div>
              <div className="flex shrink-0 items-center">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => editar(a)} aria-label="Cambiar el ajuste">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" disabled={ocupado === `${a.canal}-${a.tipo}`} onClick={() => borrar(a)} aria-label="Sacar el ajuste">
                  {ocupado === `${a.canal}-${a.tipo}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!b ? (
        <Button size="sm" variant="outline" onClick={() => setB(NUEVO)}>
          <Plus className="h-4 w-4" strokeWidth={1.5} /> Agregar ajuste
        </Button>
      ) : (
        <div className="space-y-3 rounded-xl border p-4">
          <div className="flex flex-wrap gap-2">
            <Segmentado
              chico
              etiqueta="Canal"
              valor={b.canal}
              onChange={(canal) => cambiar({ canal })}
              opciones={[
                ["ml", "Mercado Libre"],
                ["web", "Web"],
                ["personalizado", "Venta directa"],
              ]}
            />
            {b.canal !== "personalizado" && (
              <Segmentado
                chico
                etiqueta="Qué se ajusta"
                valor={b.tipo}
                onChange={(tipo) => cambiar({ tipo })}
                opciones={[
                  ["porcentaje", "Un %"],
                  ["envio", "Envío propio"],
                ]}
              />
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-[120px_160px_minmax(0,1fr)]">
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">{b.tipo === "porcentaje" ? "%" : "Envío"}</span>
              <Input value={b.valor} onChange={(e) => cambiar({ valor: e.target.value })} inputMode="decimal" placeholder={b.tipo === "porcentaje" ? "+3 o -5" : "$ 12.000"} autoFocus />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Hasta (opcional)</span>
              <Input type="date" value={b.hasta} onChange={(e) => cambiar({ hasta: e.target.value })} />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Nota (opcional)</span>
              <Input value={b.nota} onChange={(e) => cambiar({ nota: e.target.value })} placeholder="Promo Hot Sale" />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            {b.tipo === "porcentaje"
              ? `Sube o baja el precio de ${NOMBRE_CANAL[b.canal]} sobre lo que calcula el ERP${b.canal === "ml" ? "; con precio fijo en ML no se aplica" : ""}.`
              : `Reemplaza el costo de envío de ${NOMBRE_CANAL[b.canal]}${b.canal === "ml" ? "; cuenta sólo cuando el envío lo pagás vos" : ""}.`}{" "}
            Sin fecha queda fijo; vencido, deja de aplicarse solo.
          </p>

          {vista && (
            <div className="max-h-56 overflow-y-auto rounded-lg border">
              {vista.map((f) => {
                const hoy = f.hoy?.[canalAfectado];
                const nuevo = f.nuevo?.[canalAfectado];
                return (
                  <div key={f.modeloId} className="flex items-center justify-between gap-3 border-b px-3 py-2 text-sm last:border-0">
                    <span className="min-w-0 truncate">{f.nombre}</span>
                    <span className="shrink-0 font-mono text-[13px] tabular-nums">
                      {hoy != null ? pesos(hoy) : "—"} <span className="text-muted-foreground">→</span> {nuevo != null ? pesos(nuevo) : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2">
            {error && b.valor.trim() && <span className="mr-auto text-xs text-destructive">{error}</span>}
            {!varios && (
              <Button size="sm" variant="ghost" onClick={() => (setB(null), setVista(null))}>
                Cancelar
              </Button>
            )}
            <Button size="sm" variant="outline" disabled={!!error || !!ocupado} onClick={verComoQueda}>
              {ocupado === "viendo" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Ver cómo queda
            </Button>
            <Button size="sm" disabled={!!error || !!ocupado || (varios && !vista)} onClick={guardar} title={varios && !vista ? "Mirá antes cómo quedan" : undefined}>
              {ocupado === "guardando" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {varios ? `Guardar en ${modeloIds.length}` : "Guardar"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
