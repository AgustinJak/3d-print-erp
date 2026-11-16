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

async function sha256(buf: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Sube un archivo y devuelve su id (y si ya estaba). Desde docs/sdd/014 además:
 * - si ya hay uno con el mismo contenido (sha256), devuelve ése sin subir nada;
 * - de un 3MF lee las placas, sus miniaturas y, si está laminado, gramos y tiempo.
 */
export async function subirArchivo(file: File, carpeta: string | null): Promise<string> {
  return (await subirModelo(file, carpeta)).id;
}

export async function subirModelo(file: File, carpeta: string | null): Promise<{ id: string; yaEstaba: boolean }> {
  const datos = await file.arrayBuffer();
  const hash = await sha256(datos);
  const p = await json<{ id: string; ruta: string; token: string } | { existente: string }>(
    await fetch("/api/archivos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre: file.name, tamano: file.size, carpeta, hash }) })
  );
  if ("existente" in p) return { id: p.existente, yaEstaba: true };

  const supabase = createClient();
  const { error } = await supabase.storage.from(BUCKET).uploadToSignedUrl(p.ruta, p.token, file, { contentType: file.type || "application/octet-stream" });
  if (error) {
    // La fila queda sin confirmar y no se lista; se borra para no dejar basura.
    await fetch(`/api/archivos/${p.id}`, { method: "DELETE" }).catch(() => {});
    throw new Error(error.message);
  }
  await json(await fetch(`/api/archivos/${p.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "confirmar" }) }));

  // Placas y miniaturas del 3MF. Si algo falla acá, el archivo ya está: sólo queda sin placas.
  if (/\.3mf$/i.test(file.name)) {
    try {
      const { leer3mf } = await import("@/lib/leer-3mf");
      const l = leer3mf(new Uint8Array(datos));
      const r = await json<{ subidas: Array<{ placa: number | null; ruta: string; token: string }> }>(
        await fetch(`/api/archivos/${p.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accion: "lectura",
            hash,
            conMiniatura: !!l.miniatura,
            placas: l.placas.map((x) => ({ n: x.n, nombre: x.nombre, gramos: x.gramos, segundos: x.segundos, conMiniatura: !!x.miniatura })),
          }),
        })
      );
      await Promise.all(
        r.subidas.map((s) => {
          const png = s.placa == null ? l.miniatura : l.placas.find((x) => x.n === s.placa)?.miniatura;
          if (!png) return null;
          return supabase.storage.from(BUCKET).uploadToSignedUrl(s.ruta, s.token, new Blob([png as BlobPart], { type: "image/png" }), { contentType: "image/png", upsert: true });
        })
      );
    } catch {
      // sin placas
    }
  }
  return { id: p.id, yaEstaba: false };
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
