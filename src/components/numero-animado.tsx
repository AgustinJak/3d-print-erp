"use client";

import { useEffect, useRef } from "react";
import { animate, useReducedMotion } from "motion/react";

/**
 * Un número que cuenta hasta su valor al aparecer o al cambiar (docs/sdd/011). Con "reducir
 * movimiento" en el sistema, aparece directo. El texto final es siempre el formateado.
 */
export function NumeroAnimado({ valor, formato = (n) => Math.round(n).toLocaleString("es-AR"), className }: { valor: number; formato?: (n: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const desde = useRef(0);
  const quieto = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (quieto) {
      el.textContent = formato(valor);
      desde.current = valor;
      return;
    }
    const control = animate(desde.current, valor, {
      duration: 0.7,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (n) => {
        el.textContent = formato(n);
      },
    });
    desde.current = valor;
    return () => control.stop();
    // El formato es una función nueva en cada dibujo: lo que importa es el valor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor, quieto]);

  return (
    <span ref={ref} className={`tabular-nums ${className ?? ""}`}>
      {formato(valor)}
    </span>
  );
}
