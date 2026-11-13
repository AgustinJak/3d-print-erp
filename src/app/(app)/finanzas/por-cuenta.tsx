"use client";

import { AnimatePresence, motion } from "motion/react";
import { Globe } from "lucide-react";
import { COLOR_DE_CUENTA, PuntoDeCuenta, useCuentaActiva } from "@/components/cuenta-activa";
import { NumeroAnimado } from "@/components/numero-animado";
import type { CargosDelMes } from "@/lib/resultado-mes";

/**
 * Lo que dejó cada cuenta de ML en el mes (docs/sdd/010 TASK-006 y 011): sus ventas, lo que le
 * factura ML y su Flex. Mirando "Todas", las dos cuentas y lo vendido fuera de ML lado a lado; con
 * una cuenta elegida, sólo esa. Los gastos y las billeteras son del negocio entero.
 */

export interface DeUnaCuenta {
  pedidos: number;
  ingresos: number;
  costoFab: number;
  ganancia: number;
  flex: number;
  cargos: CargosDelMes | null;
  resultado: number;
}

export interface PorCuentaData {
  nombres: { principal: string; otra: string };
  cuentas: Record<"principal" | "otra" | "fuera", DeUnaCuenta>;
}

const money = (n: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);

function Linea({ texto, monto, signo, tenue }: { texto: string; monto: number; signo?: "+" | "−"; tenue?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 text-sm ${tenue ? "text-muted-foreground" : ""}`}>
      <span>{texto}</span>
      <span className="tabular-nums">
        {signo ? `${signo} ` : ""}
        {money(monto)}
      </span>
    </div>
  );
}

function Columna({ titulo, de, d, total }: { titulo: string; de: "principal" | "otra" | "fuera"; d: DeUnaCuenta; total: number }) {
  const color = de === "fuera" ? null : COLOR_DE_CUENTA[de];
  const parte = total > 0 ? Math.max(0, d.resultado) / total : 0;
  const c = d.cargos;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className={`flex flex-col rounded-xl border bg-card p-4 shadow-xs ${color ? color.borde : ""}`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-2 font-semibold ${color?.texto ?? ""}`}>
          {de === "fuera" ? <Globe className="h-3.5 w-3.5 text-muted-foreground" /> : <PuntoDeCuenta de={de} />}
          {titulo}
        </span>
        <span className="text-xs text-muted-foreground">
          {d.pedidos} {d.pedidos === 1 ? "venta" : "ventas"}
        </span>
      </div>
      <div className="space-y-1.5">
        <Linea texto="Vendido" monto={d.ingresos} />
        <Linea texto="Costo de fabricación" monto={d.costoFab} signo="−" tenue />
        {d.flex > 0 && <Linea texto="Bonificación Flex" monto={d.flex} signo="+" tenue />}
        {c && c.publicidad.total > 0 && <Linea texto="Publicidad" monto={c.publicidad.total - (de === "principal" ? c.shay.publicidad : 0)} signo="−" tenue />}
        {c && c.percepciones.total > 0 && (
          <Linea texto={`Percepciones${c.percepciones.estado === "aproximada" ? " (aprox.)" : ""}`} monto={c.percepciones.total - (de === "principal" ? c.shay.percepciones : 0)} signo="−" tenue />
        )}
        {c && c.otros.total !== 0 && <Linea texto="Otros cargos de ML" monto={c.otros.total} signo="−" tenue />}
        {c && c.percepciones.estado === "pendiente" && d.pedidos > 0 && <p className="text-[11px] text-amber-600 dark:text-amber-400">Percepciones: ML las da al cerrar el período.</p>}
      </div>
      <div className="mt-auto pt-3">
        <div className="flex items-baseline justify-between gap-3 border-t pt-3">
          <span className="text-sm font-medium">Deja</span>
          <span className={`text-lg font-bold ${d.resultado < 0 ? "text-red-500" : ""}`}>
            <NumeroAnimado valor={d.resultado} formato={money} />
          </span>
        </div>
        {total > 0 && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" title={`${Math.round(parte * 100)} % de lo que dejó el mes`}>
            <motion.div className={`h-full rounded-full ${color ? color.punto : "bg-muted-foreground/50"}`} initial={{ width: 0 }} animate={{ width: `${parte * 100}%` }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }} />
          </div>
        )}
      </div>
    </motion.div>
  );
}

export function FinanzasPorCuenta({ data, nombreMes }: { data: PorCuentaData; nombreMes: string }) {
  const { alcance } = useCuentaActiva();
  const columnas: Array<"principal" | "otra" | "fuera"> = alcance === "todas" ? ["principal", "otra", "fuera"] : [alcance];
  const total = (["principal", "otra", "fuera"] as const).reduce((s, k) => s + Math.max(0, data.cuentas[k].resultado), 0);
  const titulo = (k: "principal" | "otra" | "fuera") => (k === "fuera" ? "Web y directa" : data.nombres[k]);
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">Qué dejó cada cuenta en {nombreMes}</h2>
        <p className="text-xs text-muted-foreground">Antes de los gastos del negocio, que se ven arriba. Lo de Shay ya está descontado.</p>
      </div>
      <motion.div layout className={`grid gap-3 ${columnas.length === 3 ? "md:grid-cols-3" : "md:grid-cols-1 max-w-md"}`}>
        <AnimatePresence mode="popLayout" initial={false}>
          {columnas.map((k) => (
            <Columna key={k} titulo={titulo(k)} de={k} d={data.cuentas[k]} total={columnas.length === 3 ? total : 0} />
          ))}
        </AnimatePresence>
      </motion.div>
    </section>
  );
}
