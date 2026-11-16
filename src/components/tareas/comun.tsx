"use client";

import type { TareaVista } from "@/lib/tareas";

/** Lo que comparten las pantallas de tareas (docs/sdd/012). */

export interface Persona {
  id: string;
  userId: string;
  nombre: string;
}

export const COLUMNAS: Array<{ estado: TareaVista["estado"]; titulo: string }> = [
  { estado: "por_hacer", titulo: "Por hacer" },
  { estado: "haciendo", titulo: "Haciendo" },
  { estado: "trabada", titulo: "Trabadas" },
  { estado: "terminada", titulo: "Terminadas hoy" },
];

export const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");

/** El circulito con las iniciales del responsable. */
export function Avatar({ persona, chico }: { persona: Persona | undefined; chico?: boolean }) {
  if (!persona) return null;
  return (
    <span
      title={persona.nombre}
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-muted font-medium text-muted-foreground ring-1 ring-border ${chico ? "h-5 w-5 text-[10px]" : "h-6 w-6 text-[11px]"}`}
    >
      {iniciales(persona.nombre)}
    </span>
  );
}

export async function pedirJson<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? `Error ${r.status}`);
  return j as T;
}

export const conJson = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
