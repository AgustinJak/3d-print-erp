"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight, CheckCircle2, Info, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { json, pedir, pesos } from "@/components/producto/seccion";
import type { ResultadoDePromo, RevisionDePromo } from "@/lib/promos-ml";
import type { PedidoDePromo } from "@/lib/promos-ml-reglas";

/**
 * La vista previa de uno o varios cambios de promo y el botón que los manda (docs/sdd/006, spec 010).
 *
 * Lo que se compara viene de ML en este momento. Se manda de a tandas de 20 (lo que acepta el
 * endpoint) y cada uno se verifica con lo que paga el cliente: ML contesta bien aunque no cambie
 * nada si la publicación ya estaba en esa campaña.
 */

const TANDA = 20;

function enTandas<T>(xs: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += TANDA) out.push(xs.slice(i, i + TANDA));
  return out;
}

const precio = (n: number | null) => (n == null ? "—" : pesos(n));
const pct = (n: number | null) => (n == null ? "" : ` (${n} %)`);

const ESTADOS: Record<ResultadoDePromo["estado"], { texto: string; clase: string }> = {
  aplicado: { texto: "Listo", clase: "text-emerald-600 dark:text-emerald-400" },
  sin_efecto: { texto: "No cambió", clase: "text-amber-600" },
  rechazado: { texto: "No se mandó", clase: "text-muted-foreground" },
  error: { texto: "Error de ML", clase: "text-red-600 dark:text-red-400" },
};

export function ConfirmarPromos({ pedidos, onCerrar, onAplicado }: { pedidos: PedidoDePromo[]; onCerrar: () => void; onAplicado: () => void }) {
  const [vista, setVista] = useState<RevisionDePromo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resultados, setResultados] = useState<ResultadoDePromo[] | null>(null);
  const [avance, setAvance] = useState<number | null>(null);

  useEffect(() => {
    let vigente = true;
    (async () => {
      const todas: RevisionDePromo[] = [];
      for (const t of enTandas(pedidos)) {
        const r = await pedir<{ vista: RevisionDePromo[] }>("/api/promos/cambios", json("POST", { pedidos: t }));
        todas.push(...r.vista);
      }
      if (vigente) setVista(todas);
    })().catch((e) => vigente && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      vigente = false;
    };
  }, [pedidos]);

  const validos = vista?.filter((v) => !v.errores.length) ?? [];

  async function aplicar() {
    const mandar = validos.map((v) => v.pedido);
    const todos: ResultadoDePromo[] = [];
    setAvance(0);
    try {
      for (const t of enTandas(mandar)) {
        const r = await pedir<{ resultados: ResultadoDePromo[] }>("/api/promos/cambios", json("POST", { pedidos: t, aplicar: true }));
        todos.push(...r.resultados);
        setAvance(todos.length);
      }
    } catch (e) {
      toast.error(`Se cortó a mitad de camino: ${e instanceof Error ? e.message : e}`);
    }
    setResultados(todos);
    setAvance(null);
    const ok = todos.filter((r) => r.estado === "aplicado").length;
    if (ok) toast.success(`${ok} ${ok === 1 ? "promo quedó" : "promos quedaron"} en Mercado Libre.`);
    onAplicado();
  }

  if (error) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-600 flex items-start gap-2">
          <XCircle className="h-4 w-4 mt-0.5 shrink-0" /> {error}
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onCerrar}>
            Cerrar
          </Button>
        </DialogFooter>
      </div>
    );
  }

  if (!vista) {
    return (
      <p className="text-sm text-muted-foreground flex items-center gap-2 py-6 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Mirando en Mercado Libre cómo está cada publicación ahora…
      </p>
    );
  }

  const filas = resultados ?? vista;
  return (
    <div className="space-y-3">
      <div className="max-h-[50vh] overflow-y-auto rounded-md border divide-y text-sm">
        {filas.map((v) => {
          const r = resultados ? (v as ResultadoDePromo) : null;
          return (
            <div key={`${v.pedido.mla}-${v.pedido.promocionId}-${v.pedido.accion}`} className="px-3 py-2 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium truncate">{v.producto}</span>
                {r ? (
                  <span className={`text-xs shrink-0 ${ESTADOS[r.estado].clase}`}>{ESTADOS[r.estado].texto}</span>
                ) : (
                  <span className="text-xs text-muted-foreground shrink-0">{v.pedido.mla}</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                <span>
                  Paga {precio(v.antes.paga)}
                  {v.antes.promo ? ` en ${v.antes.promo}${pct(v.antes.pct)}` : " sin promo"}
                </span>
                <ArrowRight className="h-3 w-3" />
                <span className="text-foreground">
                  {v.pedido.accion === "sacar" ? "sin promo, " : ""}
                  {precio(v.despues.paga)}
                  {pct(v.despues.pct)}
                </span>
              </p>
              {!r &&
                v.errores.map((e) => (
                  <p key={e} className="text-xs text-red-600 dark:text-red-400 flex items-start gap-1.5">
                    <XCircle className="h-3.5 w-3.5 mt-px shrink-0" /> {e}
                  </p>
                ))}
              {!r &&
                v.avisos.map((a) => (
                  <p key={a} className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0" /> {a}
                  </p>
                ))}
              {r?.motivo && <p className="text-xs text-muted-foreground">{r.motivo}</p>}
            </div>
          );
        })}
      </div>

      {!resultados && (
        <p className="text-xs text-muted-foreground flex items-start gap-1.5">
          <Info className="h-3.5 w-3.5 mt-px shrink-0" />
          {validos.length === vista.length
            ? `${vista.length === 1 ? "Se va a mandar a" : `Se van a mandar las ${vista.length} a`} Mercado Libre. Es público: el cliente ve el precio nuevo enseguida.`
            : `${vista.length - validos.length} no se pueden mandar (en rojo). Se mandan las otras ${validos.length}.`}
        </p>
      )}

      {resultados && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {resultados.filter((r) => r.estado === "aplicado").length} de {resultados.length} quedaron. Todo quedó en el historial.
        </p>
      )}

      <DialogFooter>
        {resultados ? (
          <Button onClick={onCerrar}>Cerrar</Button>
        ) : (
          <>
            <Button variant="outline" onClick={onCerrar} disabled={avance != null}>
              Cancelar
            </Button>
            <Button onClick={aplicar} disabled={!validos.length || avance != null}>
              {avance != null ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> {avance} de {validos.length}
                </>
              ) : (
                `Mandar ${validos.length} a Mercado Libre`
              )}
            </Button>
          </>
        )}
      </DialogFooter>
    </div>
  );
}
