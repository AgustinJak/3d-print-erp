import type { Senal } from "@/lib/temas";

/**
 * La firma de Tendencias (docs/sdd/016): cada señal como una etiqueta chica con su punto, igual que
 * los ajustes de Precios. Naranja = pide atención; ámbar = algo que baja o falta; gris = dato.
 */
export function EtiquetaSenal({ s }: { s: Senal }) {
  return (
    <span className="inline-flex h-6 max-w-full items-center gap-1.5 rounded-md border px-2 text-xs whitespace-nowrap">
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.tono === "accion" ? "bg-primary" : s.tono === "aviso" ? "bg-amber-500" : "bg-muted-foreground/40"}`}
        aria-hidden
      />
      <span className={`truncate ${s.tono === "quieto" ? "text-muted-foreground" : ""}`}>{s.texto}</span>
    </span>
  );
}

/** Qué tan arriba está un tema: una barra fina, naranja desde 3 puntos (una señal fuerte). */
export function BarraDePuntaje({ puntaje, maximo }: { puntaje: number; maximo: number }) {
  const ancho = maximo > 0 ? Math.max(puntaje > 0 ? 6 : 0, Math.round((puntaje / maximo) * 100)) : 0;
  return (
    <div className="h-1 w-16 overflow-hidden rounded-full bg-muted" role="img" aria-label={`Puntaje ${puntaje}`} title={`Puntaje ${String(puntaje).replace(".", ",")}`}>
      <div className={`h-full rounded-full ${puntaje >= 3 ? "bg-primary" : "bg-foreground/30"}`} style={{ width: `${ancho}%` }} />
    </div>
  );
}

/** "27/11", leyendo la fecha como día de calendario (se guardan a la medianoche UTC). */
export function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "numeric", timeZone: "UTC" });
}

export function fechaLarga(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

export const TIPO_DE_EVENTO: Record<string, string> = {
  pelicula: "Película",
  serie: "Serie",
  anime: "Anime",
  concierto: "Recital",
  fecha_comercial: "Fecha comercial",
  gaming: "Videojuego",
  evento: "Evento",
};
