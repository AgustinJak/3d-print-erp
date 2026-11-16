"use client";

import { createClient } from "@/lib/supabase/client";

/**
 * Subidas a la biblioteca 3D (docs/sdd/012). El servidor da un token firmado y el navegador sube
 * directo al bucket privado, sin pasar el archivo por Vercel (no hay límite de 4,5 MB).
 */
const BUCKET = "archivos-3d";

async function json<T>(r: Response): Promise<T> {
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? `Error ${r.status}`);
  return j as T;
}

/** Sube un archivo y devuelve su id. */
export async function subirArchivo(file: File, carpeta: string | null): Promise<string> {
  const p = await json<{ id: string; ruta: string; token: string }>(
    await fetch("/api/archivos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre: file.name, tamano: file.size, carpeta }) })
  );
  const { error } = await createClient().storage.from(BUCKET).uploadToSignedUrl(p.ruta, p.token, file, { contentType: file.type || "application/octet-stream" });
  if (error) {
    // La fila queda sin confirmar y no se lista; se borra para no dejar basura.
    await fetch(`/api/archivos/${p.id}`, { method: "DELETE" }).catch(() => {});
    throw new Error(error.message);
  }
  await json(await fetch(`/api/archivos/${p.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "confirmar" }) }));
  return p.id;
}

/** Guarda la miniatura que sacó el visor. Si falla, no pasa nada: se vuelve a intentar al verlo. */
export async function guardarMiniatura(id: string, png: Blob): Promise<void> {
  try {
    const p = await json<{ ruta: string; token: string }>(await fetch(`/api/archivos/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "miniatura" }) }));
    await createClient().storage.from(BUCKET).uploadToSignedUrl(p.ruta, p.token, png, { contentType: "image/png", upsert: true });
  } catch {
    // sin miniatura
  }
}

/** Un link firmado para ver o bajar el archivo. */
export async function linkDe(id: string, descargar: boolean): Promise<{ url: string; nombre: string; extension: string | null }> {
  return json(await fetch(`/api/archivos/${id}/link${descargar ? "?descargar=1" : ""}`));
}

export async function descargar(id: string) {
  const { url } = await linkDe(id, true);
  window.location.href = url;
}
