"use client";

import { pesos } from "@/components/producto/seccion";
import { decimal } from "@/lib/publicidad-reglas";

/**
 * Gasto y ventas atribuidas por día (docs/sdd/005, spec 001). Barras superpuestas: la verde es lo
 * vendido, la de color lo gastado; donde la de color casi tapa a la verde, ese día no rindió.
 */
export function GraficoDiario({ dias }: { dias: Array<{ date: string; cost: number; total_amount: number }> }) {
  if (dias.length < 2) return null;
  const max = Math.max(...dias.map((d) => Math.max(d.cost, d.total_amount)), 1);
  const ancho = 24;
  const alto = 120;
  const barra = 16;
  const fecha = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

  return (
    <figure className="space-y-1.5">
      {/* Se estira a lo ancho: por eso las fechas van afuera, en HTML, y no se deforman. */}
      <svg viewBox={`0 0 ${dias.length * ancho} ${alto}`} className="w-full h-32" preserveAspectRatio="none" role="img" aria-label="Gasto y ventas por día">
        {[0.5, 1].map((f) => (
          <line key={f} x1={0} x2={dias.length * ancho} y1={alto - alto * f} y2={alto - alto * f} className="stroke-border" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
        ))}
        {dias.map((d, i) => {
          const x = i * ancho + (ancho - barra) / 2;
          const hv = (d.total_amount / max) * alto;
          const hg = (d.cost / max) * alto;
          const roas = d.cost > 0 ? d.total_amount / d.cost : null;
          return (
            <g key={d.date}>
              <title>{`${fecha(d.date)} · gastó ${pesos(d.cost)} · vendió ${pesos(d.total_amount)}${roas != null ? ` · ROAS ${decimal(roas)}` : ""}`}</title>
              <rect x={x} y={alto - hv} width={barra} height={hv} rx={2} className="fill-emerald-500/30" />
              <rect x={x + 3} y={alto - hg} width={barra - 6} height={hg} rx={1.5} className="fill-primary" />
              <rect x={i * ancho} y={0} width={ancho} height={alto} fill="transparent" />
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums">
        <span>{fecha(dias[0].date)}</span>
        <span>{fecha(dias[Math.floor((dias.length - 1) / 2)].date)}</span>
        <span>{fecha(dias[dias.length - 1].date)}</span>
      </div>
      <figcaption className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500/40" /> Ventas atribuidas
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-primary" /> Gasto
        </span>
        <span className="ml-auto">Toda la cuenta, Shay incluida · pasá el mouse por un día</span>
      </figcaption>
    </figure>
  );
}
