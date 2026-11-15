"use client";

import { useMemo, useRef, useState } from "react";
import { motion } from "motion/react";

/**
 * El gráfico principal del Panel (docs/sdd/011, con la guía de unslop): lo vendido en el mes,
 * acumulado día por día, contra el mes anterior. Una línea con el acento (este mes) y la otra en un
 * gris de la gama (el anterior), sobre una grilla callada con etiquetas mono. Al pasar el mouse, el
 * día con los dos valores.
 */

export interface DiaDeVenta {
  dia: string; // YYYY-MM-DD
  total: number;
  pedidos: number;
}

interface Props {
  actual: { mes: string; dias: DiaDeVenta[] };
  anterior: { mes: string; dias: DiaDeVenta[] };
}

const money = (n: number) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
const corto = (n: number) => (n >= 1_000_000 ? `$${(n / 1_000_000).toLocaleString("es-AR", { maximumFractionDigits: 1 })} M` : n >= 1000 ? `$${Math.round(n / 1000)} mil` : `$${Math.round(n)}`);
const nombreDelMes = (clave: string) => {
  const [a, m] = clave.split("-").map(Number);
  return new Date(a, m - 1, 1).toLocaleDateString("es-AR", { month: "long" });
};
const diasDelMes = (clave: string) => {
  const [a, m] = clave.split("-").map(Number);
  return new Date(a, m, 0).getDate();
};

/** Lo acumulado hasta cada día; null después de hoy en el mes en curso. */
function acumulado(dias: DiaDeVenta[], largo: number, hasta: number): Array<number | null> {
  const porDia = new Map(dias.map((d) => [Number(d.dia.slice(8, 10)), d.total]));
  const out: Array<number | null> = [];
  let suma = 0;
  for (let d = 1; d <= largo; d++) {
    suma += porDia.get(d) ?? 0;
    out.push(d <= hasta ? suma : null);
  }
  return out;
}

const W = 720;
const H = 260;
const PAD = { arriba: 12, abajo: 28, izq: 0, der: 56 };

export function GraficoDelMes({ actual, anterior }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const [foco, setFoco] = useState<number | null>(null);

  const hoy = new Date();
  const esEsteMes = actual.mes === `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
  const largo = diasDelMes(actual.mes);
  const hoyDia = esEsteMes ? hoy.getDate() : largo;

  const { serieA, serieB, max } = useMemo(() => {
    const a = acumulado(actual.dias, largo, hoyDia);
    const b = acumulado(anterior.dias, largo, Math.min(largo, diasDelMes(anterior.mes)));
    return { serieA: a, serieB: b, max: Math.max(1, ...a.map((v) => v ?? 0), ...b.map((v) => v ?? 0)) };
  }, [actual, anterior, largo, hoyDia]);

  const x = (d: number) => PAD.izq + ((d - 1) / (largo - 1)) * (W - PAD.izq - PAD.der);
  const y = (v: number) => PAD.arriba + (1 - v / (max * 1.08)) * (H - PAD.arriba - PAD.abajo);
  const camino = (serie: Array<number | null>) =>
    serie
      .map((v, i) => (v == null ? null : `${i === 0 ? "M" : "L"}${x(i + 1).toFixed(1)},${y(v).toFixed(1)}`))
      .filter(Boolean)
      .join(" ")
      .replace(/^L/, "M");

  const hastaHoy = serieA[hoyDia - 1] ?? 0;
  const mismoDiaAntes = serieB[Math.min(hoyDia, serieB.length) - 1] ?? 0;
  const cambio = mismoDiaAntes > 0 ? ((hastaHoy - mismoDiaAntes) / mismoDiaAntes) * 100 : null;
  const pedidosDelMes = actual.dias.reduce((s, d) => s + d.pedidos, 0);

  const grilla = [0.25, 0.5, 0.75, 1].map((f) => max * f);
  const marcas = [1, 8, 15, 22, largo];

  const alMover = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const px = ((e.clientX - r.left) / r.width) * W;
    const d = Math.round(((px - PAD.izq) / (W - PAD.izq - PAD.der)) * (largo - 1)) + 1;
    setFoco(Math.max(1, Math.min(largo, d)));
  };

  const area = `${camino(serieA)} L${x(hoyDia).toFixed(1)},${y(0).toFixed(1)} L${x(1).toFixed(1)},${y(0).toFixed(1)} Z`;
  const valorFoco = foco != null ? serieA[foco - 1] : null;
  const antesFoco = foco != null ? serieB[foco - 1] : null;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <p className="text-sm text-muted-foreground">Vendido en {nombreDelMes(actual.mes)}</p>
          <p className="mt-1 font-mono text-[32px] leading-none font-medium tabular-nums">{money(hastaHoy)}</p>
        </div>
        <p className="text-[13px] text-muted-foreground">
          {pedidosDelMes} {pedidosDelMes === 1 ? "pedido" : "pedidos"}
          {cambio != null && (
            <>
              {" · "}
              <span className={cambio >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
                {cambio >= 0 ? "+" : "−"}
                {Math.abs(Math.round(cambio))} %
              </span>{" "}
              vs el {hoyDia} de {nombreDelMes(anterior.mes)} ({corto(mismoDiaAntes)})
            </>
          )}
        </p>
      </div>

      <div className="relative mt-6">
        <svg
          ref={ref}
          viewBox={`0 0 ${W} ${H}`}
          className="h-[260px] w-full touch-none select-none"
          preserveAspectRatio="none"
          onPointerMove={alMover}
          onPointerLeave={() => setFoco(null)}
          role="img"
          aria-label={`Vendido en ${nombreDelMes(actual.mes)}: ${money(hastaHoy)} hasta el día ${hoyDia}`}
        >
          {grilla.map((v) => (
            <line key={v} x1={0} x2={W - PAD.der} y1={y(v)} y2={y(v)} className="stroke-border" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          <line x1={0} x2={W - PAD.der} y1={y(0)} y2={y(0)} className="stroke-foreground/15" strokeWidth={1} vectorEffect="non-scaling-stroke" />

          {/* El mes anterior: gris, punteado */}
          <path d={camino(serieB)} fill="none" className="stroke-muted-foreground/45" strokeWidth={1.5} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />

          {/* Este mes: el acento, con un relleno muy suave */}
          <motion.path d={area} className="fill-primary/[0.07]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.3 }} />
          <motion.path
            d={camino(serieA)}
            fill="none"
            className="stroke-primary"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          />

          {foco != null && <line x1={x(foco)} x2={x(foco)} y1={PAD.arriba} y2={y(0)} className="stroke-foreground/25" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
        </svg>

        {/* Los puntos y las etiquetas van en HTML: el SVG se estira y deformaría los círculos y el texto. */}
        <span className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-4 ring-primary/15" style={{ left: `${(x(hoyDia) / W) * 100}%`, top: y(hastaHoy) }} />
        {grilla.map((v) => (
          <span key={v} className="pointer-events-none absolute right-0 -translate-y-1/2 font-mono text-[11px] text-muted-foreground" style={{ top: y(v) }}>
            {corto(v)}
          </span>
        ))}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-5">
          {marcas.map((d) => (
            <span key={d} className="absolute -translate-x-1/2 font-mono text-[11px] text-muted-foreground" style={{ left: `${(x(d) / W) * 100}%` }}>
              {d}
            </span>
          ))}
        </div>

        {foco != null && (
          <div
            className="pointer-events-none absolute top-0 z-10 w-44 rounded-lg border bg-popover p-2.5 text-xs shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
            style={{ left: `clamp(0px, calc(${(x(foco) / W) * 100}% - 88px), calc(100% - 176px))` }}
          >
            <p className="mb-1.5 font-medium">Día {foco}</p>
            <p className="flex justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <span className="h-0.5 w-3 rounded bg-primary" /> {nombreDelMes(actual.mes)}
              </span>
              <span className="font-mono tabular-nums">{valorFoco != null ? corto(valorFoco) : "—"}</span>
            </p>
            <p className="mt-1 flex justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <span className="h-0.5 w-3 rounded bg-muted-foreground/45" /> {nombreDelMes(anterior.mes)}
              </span>
              <span className="font-mono tabular-nums">{antesFoco != null ? corto(antesFoco) : "—"}</span>
            </p>
          </div>
        )}
      </div>

      <div className="mt-4 flex gap-5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span className="h-0.5 w-4 rounded bg-primary" /> {nombreDelMes(actual.mes)}, acumulado
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-0 w-4 border-t border-dashed border-muted-foreground/60" /> {nombreDelMes(anterior.mes)}
        </span>
      </div>
    </div>
  );
}
