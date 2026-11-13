"use client";

import { createContext, useContext, useEffect, useId, useMemo, useState, useSyncExternalStore } from "react";
import { motion } from "motion/react";
import type { Alcance } from "@/lib/productos-lista";

/**
 * A qué cuenta de Mercado Libre se mira y se le aplican los cambios (docs/sdd/011): Sendero 3D,
 * Sendero Shop o las dos. Es una sola elección para todo el ERP: se elige arriba de cada sección y
 * se mantiene al pasar de una a otra. Al entrar de nuevo arranca en "Todas".
 */

export interface CuentasDelNegocio {
  principal: string;
  /** La otra cuenta conectada; null si hay una sola (y entonces no hay nada que elegir). */
  otra: string | null;
  otraId: string | null;
}

interface Valor {
  alcance: Alcance;
  setAlcance: (a: Alcance) => void;
  cuentas: CuentasDelNegocio;
  /** El nombre de lo elegido: "Sendero 3D", "Sendero Shop" o "las dos cuentas". */
  nombre: string;
}

const GUARDADO = "cuenta:alcance";
const SIN_CUENTAS: CuentasDelNegocio = { principal: "Sendero 3D", otra: null, otraId: null };
// La elección vive en la sesión del navegador: dura mientras esté abierto y se comparte entre secciones.
let enMemoria: Alcance | null = null;
const oyentes = new Set<() => void>();
const suscribir = (f: () => void) => {
  oyentes.add(f);
  return () => void oyentes.delete(f);
};
function leerAlcance(): Alcance {
  if (enMemoria) return enMemoria;
  try {
    const a = sessionStorage.getItem(GUARDADO);
    if (a === "principal" || a === "otra" || a === "todas") return a;
  } catch {
    // Sin almacenamiento: arranca en Todas.
  }
  return "todas";
}
function setAlcance(a: Alcance) {
  enMemoria = a;
  try {
    sessionStorage.setItem(GUARDADO, a);
  } catch {
    // Igual queda elegido mientras dure la página.
  }
  for (const f of oyentes) f();
}

const Contexto = createContext<Valor>({ alcance: "principal", setAlcance: () => {}, cuentas: SIN_CUENTAS, nombre: "Sendero 3D" });

export function CuentaActivaProvider({ children }: { children: React.ReactNode }) {
  const alcance = useSyncExternalStore<Alcance>(suscribir, leerAlcance, () => "todas");
  const [cuentas, setCuentas] = useState<CuentasDelNegocio>(SIN_CUENTAS);

  useEffect(() => {
    let vigente = true;
    fetch("/api/ml/cuentas")
      .then((r) => (r.ok ? r.json() : null))
      .then((r: { principal: { nombre: string } | null; otras: Array<{ id: string; nombre: string }> } | null) => {
        if (!vigente || !r) return;
        setCuentas({ principal: r.principal?.nombre ?? "Sendero 3D", otra: r.otras[0]?.nombre ?? null, otraId: r.otras[0]?.id ?? null });
      })
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, []);

  const valor = useMemo<Valor>(() => {
    // Con una sola cuenta no hay otra que mirar.
    const real: Alcance = cuentas.otra ? alcance : "principal";
    return { alcance: real, setAlcance, cuentas, nombre: real === "principal" ? cuentas.principal : real === "otra" ? (cuentas.otra ?? "") : "las dos cuentas" };
  }, [alcance, cuentas]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export const useCuentaActiva = () => useContext(Contexto);

/** El color de cada cuenta, el mismo en todo el ERP. */
export const COLOR_DE_CUENTA = {
  principal: { punto: "bg-violet-500", texto: "text-violet-700 dark:text-violet-300", fondo: "bg-violet-500/10", borde: "border-violet-500/30" },
  otra: { punto: "bg-teal-500", texto: "text-teal-700 dark:text-teal-300", fondo: "bg-teal-500/10", borde: "border-teal-500/30" },
} as const;

export type DeCuenta = keyof typeof COLOR_DE_CUENTA;

export function PuntoDeCuenta({ de, className = "" }: { de: DeCuenta; className?: string }) {
  return <span aria-hidden className={`inline-block h-2 w-2 shrink-0 rounded-full ${COLOR_DE_CUENTA[de].punto} ${className}`} />;
}

/** El nombre de una cuenta con su punto de color. */
export function EtiquetaDeCuenta({ de, className = "" }: { de: DeCuenta; className?: string }) {
  const { cuentas } = useCuentaActiva();
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <PuntoDeCuenta de={de} />
      {de === "principal" ? cuentas.principal : cuentas.otra}
    </span>
  );
}

/**
 * El selector de cuenta: va arriba de cada sección que muestra o cambia cosas de Mercado Libre.
 * Con una sola cuenta conectada no se dibuja.
 */
export function SelectorDeCuenta({ className = "" }: { className?: string }) {
  const { alcance, setAlcance, cuentas } = useCuentaActiva();
  const id = useId();
  if (!cuentas.otra) return null;
  const opciones: Array<{ valor: Alcance; texto: string; puntos: DeCuenta[] }> = [
    { valor: "todas", texto: "Todas", puntos: ["principal", "otra"] },
    { valor: "principal", texto: cuentas.principal, puntos: ["principal"] },
    { valor: "otra", texto: cuentas.otra, puntos: ["otra"] },
  ];
  return (
    <div role="radiogroup" aria-label="Cuenta de Mercado Libre" className={`inline-flex items-center rounded-full border bg-muted/50 p-0.5 text-sm ${className}`}>
      {opciones.map((o) => {
        const puesta = alcance === o.valor;
        return (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={puesta}
            onClick={() => setAlcance(o.valor)}
            className={`relative inline-flex h-8 items-center gap-1.5 rounded-full px-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${puesta ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {puesta && <motion.span layoutId={`cuenta-${id}`} className="absolute inset-0 rounded-full bg-background shadow-sm ring-1 ring-border" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
            <span className="relative inline-flex items-center -space-x-0.5">
              {o.puntos.map((p) => (
                <PuntoDeCuenta key={p} de={p} className="ring-2 ring-background" />
              ))}
            </span>
            <span className={`relative whitespace-nowrap ${puesta ? "font-medium" : ""}`}>{o.texto}</span>
          </button>
        );
      })}
    </div>
  );
}
