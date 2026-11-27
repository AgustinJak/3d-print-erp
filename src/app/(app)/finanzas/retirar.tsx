"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, CreditCard, Loader2, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ParteTarjeta, Retiro } from "@/lib/retirable";

/**
 * Cuánto se puede retirar de Mercado Pago (docs/sdd/019): parte del saldo real, no de la billetera.
 * Mercado Pago es sólo de la empresa (2026-11-27) y la ganancia se pasa a una cuenta personal.
 */

const ZONA = "America/Argentina/Buenos_Aires";
const plata = (n: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
const cuando = (iso: string) => new Date(iso).toLocaleString("es-AR", { timeZone: ZONA, day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
const diaCorto = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("es-AR", { day: "numeric", month: "numeric", timeZone: "UTC" });
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? `Error ${r.status}`);
  return j as T;
}

export function Retirar({ socios }: { socios: Array<{ nombre: string; porcentaje: number }> }) {
  const [r, setR] = useState<Retiro | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(() => {
    pedir<Retiro>("/api/finanzas/retirable").then(setR).catch((e) => toast.error(e.message));
  }, []);
  useEffect(() => cargar(), [cargar]);

  async function leerSaldo() {
    setLeyendo(true);
    try {
      setR(await pedir<Retiro>("/api/finanzas/retirable", { method: "POST" }));
      toast.success("Saldo de Mercado Pago actualizado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLeyendo(false);
    }
  }

  async function tocarResumen(id: string, cambio: { pagado?: boolean; partes?: ParteTarjeta[] }) {
    try {
      await pedir("/api/finanzas/tarjeta", { method: "PATCH", body: JSON.stringify({ id, ...cambio }) });
      cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  if (!r) return <div className="h-24 animate-pulse rounded-lg bg-muted/50" />;

  const puede = r.puede;
  const resta: Array<[string, number]> = [
    [`Lo de Shay sin pagar (${r.shay.meses.map((m) => MESES[m.mes - 1]).join(", ") || "nada"})`, r.shay.total],
    ["Tarjeta de Mercado Pago, sin pagar", r.tarjeta.total],
    [`Lo que va a facturar ML (${r.ml.meses.map((m) => MESES[Number(m.mes.slice(5)) - 1]).join(" y ")})`, r.ml.total],
    [`Gastos de los próximos ${r.dias} días`, r.gastos],
    ["Lo que se le debe al repartidor", r.reparto],
  ];
  const sinCalcular = r.shay.meses.filter((m) => m.aPasar == null);

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs text-muted-foreground">Se puede retirar de Mercado Pago</p>
        {!r.saldo ? (
          <p className="mt-1 text-sm">Todavía no se leyó el saldo de Mercado Pago.</p>
        ) : puede > 0 ? (
          <>
            <p className="mt-0.5 text-2xl font-bold tabular-nums text-primary">{plata(puede)}</p>
            {socios.length > 0 && <p className="text-xs text-muted-foreground">{socios.map((s) => `${s.nombre} ${plata(puede * (s.porcentaje / 100))}`).join(" · ")}</p>}
          </>
        ) : (
          <>
            <p className="mt-0.5 text-2xl font-bold tabular-nums">$ 0</p>
            <p className="text-xs text-amber-600 dark:text-amber-400">Hoy no: faltan {plata(-puede)} para lo que ya se sabe que va a salir.</p>
          </>
        )}
      </div>

      {r.saldo && (
        <div className="space-y-0.5 text-xs">
          <div className="flex justify-between gap-2">
            <span>Saldo en Mercado Pago, al {cuando(r.saldo.al)}</span>
            <span className="font-mono tabular-nums">{plata(r.saldo.monto)}</span>
          </div>
          {resta.filter(([, n]) => n > 0).map(([texto, n]) => (
            <div key={texto} className="flex justify-between gap-2 text-muted-foreground">
              <span>− {texto}</span>
              <span className="font-mono tabular-nums">{plata(n)}</span>
            </div>
          ))}
          {sinCalcular.length > 0 && <p className="text-amber-600 dark:text-amber-400">Lo de Shay de {sinCalcular.map((m) => MESES[m.mes - 1]).join(", ")} no está calculado: leé el saldo para calcularlo.</p>}
          <p className="pt-1 text-muted-foreground">No cuenta lo que falta liberar: hasta que Mercado Pago lo libera no se puede sacar. Lo de Shay va entero, aunque una parte todavía no se haya liberado.</p>
        </div>
      )}

      {/* La tarjeta: lo personal lo deposita cada socio en Mercado Pago antes del vencimiento. */}
      {r.tarjeta.resumenes.map((t) => (
        <div key={t.id} className="space-y-1 rounded-lg border p-2.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5">
              <CreditCard className="h-3.5 w-3.5" strokeWidth={1.5} /> Resumen que vence el {diaCorto(t.vencimiento)}: <span className="font-mono tabular-nums">{plata(t.total)}</span>
            </span>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => tocarResumen(t.id, { pagado: true })}>
              <Check className="h-3 w-3" /> Pagado
            </Button>
          </div>
          {t.partes.map((p, i) => (
            <div key={p.socio} className="flex items-center justify-between gap-2 text-muted-foreground">
              <span className={p.depositado ? "line-through" : ""}>
                {p.socio} deposita {plata(p.monto)} antes del {diaCorto(t.vencimiento)}
              </span>
              <button
                type="button"
                className="underline-offset-2 hover:underline"
                onClick={() => tocarResumen(t.id, { partes: t.partes.map((x, j) => (j === i ? { ...x, depositado: !x.depositado } : x)) })}
              >
                {p.depositado ? "deshacer" : "ya depositó"}
              </button>
            </div>
          ))}
        </div>
      ))}

      {cargando && <CargarResumen socios={socios.map((s) => s.nombre)} onListo={() => { setCargando(false); cargar(); }} onCancelar={() => setCargando(false)} />}

      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" onClick={leerSaldo} disabled={leyendo} className="flex-1 gap-1.5">
          {leyendo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {leyendo ? "Leyendo… hasta 2 minutos" : "Leer saldo de Mercado Pago"}
        </Button>
        {!cargando && (
          <Button size="sm" variant="ghost" onClick={() => setCargando(true)} className="gap-1.5">
            <CreditCard className="h-3.5 w-3.5" /> Cargar resumen de tarjeta
          </Button>
        )}
      </div>
      {r.saldo && <p className="text-[11px] text-muted-foreground">Saldo leído el {cuando(r.saldo.leidoEn)}. Para retirar, usá el botón Retiro con el nombre de quien saca.</p>}
    </div>
  );
}

function CargarResumen({ socios, onListo, onCancelar }: { socios: string[]; onListo: () => void; onCancelar: () => void }) {
  const [cierre, setCierre] = useState("");
  const [vencimiento, setVencimiento] = useState("");
  const [total, setTotal] = useState("");
  const [partes, setPartes] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const num = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));

  async function guardar() {
    setGuardando(true);
    try {
      await pedir("/api/finanzas/tarjeta", {
        method: "POST",
        body: JSON.stringify({ cierre, vencimiento, total: num(total), partes: socios.map((s) => ({ socio: s, monto: num(partes[s] || "0") })) }),
      });
      toast.success("Resumen cargado");
      onListo();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border p-2.5 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-medium">Resumen de la tarjeta de Mercado Pago</span>
        <button type="button" onClick={onCancelar} aria-label="Cancelar">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-0.5">
          <span className="text-muted-foreground">Cierre</span>
          <Input type="date" value={cierre} onChange={(e) => setCierre(e.target.value)} className="h-8 text-xs" />
        </label>
        <label className="space-y-0.5">
          <span className="text-muted-foreground">Vence</span>
          <Input type="date" value={vencimiento} onChange={(e) => setVencimiento(e.target.value)} className="h-8 text-xs" />
        </label>
      </div>
      <label className="block space-y-0.5">
        <span className="text-muted-foreground">Total del resumen</span>
        <Input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="535018" className="h-8 text-xs" />
      </label>
      <p className="text-muted-foreground">De eso, lo personal de cada uno (lo deposita en Mercado Pago antes del vencimiento):</p>
      <div className="grid grid-cols-2 gap-2">
        {socios.map((s) => (
          <label key={s} className="space-y-0.5">
            <span className="text-muted-foreground">{s}</span>
            <Input inputMode="decimal" value={partes[s] ?? ""} onChange={(e) => setPartes((p) => ({ ...p, [s]: e.target.value }))} placeholder="0" className="h-8 text-xs" />
          </label>
        ))}
      </div>
      <Button size="sm" onClick={guardar} disabled={guardando || !cierre || !vencimiento || !total} className="w-full">
        {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Guardar
      </Button>
    </div>
  );
}
