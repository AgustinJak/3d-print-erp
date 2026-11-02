"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { json, pedir } from "@/components/producto/seccion";
import { DIAS_MAX, pasosPara, type Entrega, type EstadoFlex, type ResultadoFlex } from "@/lib/entrega-ml";

/**
 * Entrega de varias publicaciones (docs/sdd/006, spec 007), como trabaja Agustín:
 * - con stock, entrega inmediata: sin tiempo de disponibilidad y con Flex;
 * - sin stock, a pedido: sin Flex y con N días, así las ventas entran para después.
 * Primero cómo está cada una en ML ahora (y el stock del ERP, como pista); después se manda, se
 * verifica en la publicación y queda registrado. El stock de ML no se toca.
 */
const TANDA = 20;
// Al mandar, de a 2: cada publicación puede tardar 15 s o más esperando que ML muestre el cambio de
// Flex (Carrete, 2026-11-02), y el pedido tiene 60 s.
const TANDA_MANDAR = 2;
const ESTADO: Record<ResultadoFlex["estado"], { texto: string; clase: string }> = {
  aplicado: { texto: "Listo", clase: "text-emerald-600 dark:text-emerald-400" },
  sin_efecto: { texto: "No cambió", clase: "text-amber-600" },
  error: { texto: "Error", clase: "text-red-600 dark:text-red-400" },
};

const hoy = (e: EstadoFlex) => (e.flex == null ? "no se pudo leer" : [e.flex ? "con Flex" : "sin Flex", e.dias != null ? `${e.dias} días` : "inmediata"].join(", "));

export function ConfirmarFlex({ mlas, inmediata, onCerrar, onHecho }: { mlas: string[]; inmediata: boolean; onCerrar: () => void; onHecho: () => void }) {
  const [estados, setEstados] = useState<EstadoFlex[] | null>(null);
  const [resultados, setResultados] = useState<ResultadoFlex[] | null>(null);
  const [dias, setDias] = useState("15");
  const [avance, setAvance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    (async () => {
      const todos: EstadoFlex[] = [];
      for (let i = 0; i < mlas.length; i += TANDA) {
        const r = await pedir<{ estados: EstadoFlex[] }>("/api/precios/flex", json("POST", { mlas: mlas.slice(i, i + TANDA), entrega: { modo: "inmediata" } }));
        todos.push(...r.estados);
      }
      if (!vigente) return;
      setEstados(todos);
      // Arranca con los días que ya usa la mayoría de las elegidas, o 15.
      const usados = todos.map((e) => e.dias).filter((d): d is number => d != null);
      if (usados.length) setDias(String([...usados].sort((a, b) => usados.filter((x) => x === b).length - usados.filter((x) => x === a).length)[0]));
    })().catch((e) => vigente && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      vigente = false;
    };
  }, [mlas]);

  const n = Number(dias);
  const diasOk = Number.isInteger(n) && n >= 1 && n <= DIAS_MAX;
  const entrega: Entrega | null = inmediata ? { modo: "inmediata" } : diasOk ? { modo: "a_pedido", dias: n } : null;
  const pasosDe = (e: EstadoFlex) => (entrega && e.flex != null ? pasosPara(e, entrega) : []);
  const mandar = estados?.filter((e) => pasosDe(e).length) ?? [];

  async function aplicar() {
    if (!entrega) return;
    const todos: ResultadoFlex[] = [];
    setAvance(0);
    try {
      for (let i = 0; i < mandar.length; i += TANDA_MANDAR) {
        const r = await pedir<{ resultados: ResultadoFlex[] }>("/api/precios/flex", json("POST", { mlas: mandar.slice(i, i + TANDA_MANDAR).map((e) => e.mla), entrega, aplicar: true }));
        todos.push(...r.resultados);
        setAvance(todos.length);
      }
    } catch (e) {
      toast.error(`Se cortó a mitad de camino: ${e instanceof Error ? e.message : e}`);
    }
    setResultados(todos);
    setAvance(null);
    const ok = todos.filter((r) => r.estado === "aplicado").length;
    if (ok) toast.success(`${ok} ${ok === 1 ? "publicación quedó" : "publicaciones quedaron"} ${inmediata ? "con entrega inmediata" : "a pedido"}.`);
    onHecho();
  }

  if (error)
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
  if (!estados)
    return (
      <p className="text-sm text-muted-foreground flex items-center gap-2 py-6 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Mirando en Mercado Libre cómo está cada una…
      </p>
    );

  const filas: Array<EstadoFlex & { estado?: ResultadoFlex["estado"]; motivo?: string | null }> = resultados ?? estados;
  return (
    <div className="space-y-3">
      {!inmediata && !resultados && (
        <label className="flex items-center gap-2 text-sm">
          Días de disponibilidad
          <Input value={dias} onChange={(e) => setDias(e.target.value)} inputMode="numeric" className="h-8 w-20" disabled={avance != null} />
          <span className="text-xs text-muted-foreground">hasta {DIAS_MAX}</span>
        </label>
      )}
      <div className="max-h-[50vh] overflow-y-auto rounded-md border divide-y text-sm">
        {filas.map((e) => {
          const pasos = e.estado == null ? pasosDe(e) : [];
          const stock = e.stockErp == null ? "sin stock cargado en el ERP" : `stock ERP ${e.stockErp}`;
          // El stock del ERP es una pista: avisa si contradice lo que se está por hacer.
          const choca = e.estado == null && e.stockErp != null && (inmediata ? e.stockErp <= 0 : e.stockErp > 0);
          return (
            <div key={e.mla} className={`px-3 py-2 flex items-center justify-between gap-2 ${e.estado == null && !pasos.length ? "opacity-60" : ""}`}>
              <span className="min-w-0">
                <span className="block truncate">{e.titulo ?? e.mla}</span>
                <span className="text-xs text-muted-foreground">
                  {e.mla} · hoy {hoy(e)} · <span className={choca ? "text-amber-600" : ""}>{stock}</span>
                  {e.estado == null && (pasos.length ? ` · ${pasos.join(" y ")}` : " · ya está así")}
                  {e.motivo ? ` · ${e.motivo}` : ""}
                </span>
              </span>
              {e.estado && <span className={`text-xs shrink-0 ${ESTADO[e.estado].clase}`}>{ESTADO[e.estado].texto}</span>}
            </div>
          );
        })}
      </div>
      {!resultados && (
        <p className="text-xs text-muted-foreground">
          {!entrega
            ? `Los días van de 1 a ${DIAS_MAX}.`
            : mandar.length
              ? `Se cambian ${mandar.length} de ${estados.length}. ${inmediata ? "Primero se saca la disponibilidad y después se prende Flex." : "Primero se apaga Flex y después se ponen los días (con Flex, ML los borra)."} El stock de ML no se toca.`
              : "Nada para cambiar."}
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
            <Button onClick={aplicar} disabled={!mandar.length || avance != null}>
              {avance != null ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> {avance} de {mandar.length}
                </>
              ) : (
                `Cambiar ${mandar.length}`
              )}
            </Button>
          </>
        )}
      </DialogFooter>
    </div>
  );
}
