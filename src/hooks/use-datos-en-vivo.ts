"use client";

import { useEffect, useRef } from "react";

const INTERVALO_MS = 15_000;

/**
 * Mantiene la pantalla al día sin F5.
 *
 * En vez de recargar los datos cada X segundos, pregunta por una huella barata
 * (`/api/cambios`) y sólo recarga cuando algo cambió de verdad. Así un pedido
 * que entra por webhook o por cron aparece solo, y una pestaña abierta todo el
 * día no genera tráfico al pedo.
 *
 * Mientras la pestaña está en segundo plano no consulta nada; al volver a ella
 * se sincroniza de inmediato, que es cuando importa.
 */
export function useDatosEnVivo(recargar: () => void | Promise<void>) {
  // La referencia se guarda en un ref para que el ciclo no se reinicie cada vez
  // que el componente vuelve a renderizar.
  const recargarRef = useRef(recargar);
  useEffect(() => {
    recargarRef.current = recargar;
  }, [recargar]);

  useEffect(() => {
    let vivo = true;
    let ultima: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const revisar = async (forzarPrimera = false) => {
      if (!vivo || document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/cambios", { cache: "no-store" });
        if (!res.ok) return;
        const { v } = await res.json();
        if (ultima === null) {
          // Primera lectura: sólo se guarda como referencia.
          ultima = v;
          if (forzarPrimera) await recargarRef.current();
          return;
        }
        if (v !== ultima) {
          ultima = v;
          await recargarRef.current();
        }
      } catch {
        // Sin internet o servidor caído: se reintenta en el próximo tick.
      }
    };

    const ciclo = async () => {
      await revisar();
      if (vivo) timer = setTimeout(ciclo, INTERVALO_MS);
    };

    // Al volver a la pestaña se revisa enseguida, sin esperar el intervalo.
    const alVolver = () => {
      if (document.visibilityState === "visible") revisar();
    };

    timer = setTimeout(ciclo, INTERVALO_MS);
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);

    return () => {
      vivo = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", alVolver);
    };
  }, []);
}
