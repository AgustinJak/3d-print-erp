"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Download, FileBox, ImageIcon, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/file-upload";
import { json, pedir, Seccion } from "@/components/producto/seccion";
import type { Ficha } from "@/app/api/modelos/[id]/ficha/route";

const MAXIMO = 5;

/**
 * Fotos y archivo (spec 002, REQ-3). Sin botón Guardar: lo que se sube, se borra o se elige como
 * principal se guarda en el momento (RN-4).
 */
export function SeccionFotos({ producto, onCambio }: { producto: Ficha["producto"]; onCambio: () => void }) {
  const [ocupado, setOcupado] = useState(false);
  const fotos = producto.imagenesUrls;

  async function guardar(body: Record<string, unknown>, aviso: string) {
    setOcupado(true);
    try {
      await pedir(`/api/modelos/${producto.id}`, json("PATCH", body));
      toast.success(aviso);
      onCambio();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Seccion titulo="Fotos y archivo" icono={ImageIcon}>
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {fotos.map((url, i) => (
            <div key={url} className="relative group aspect-square rounded-lg overflow-hidden border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="w-full h-full object-cover" />
              {i === 0 ? (
                <span className="absolute top-1 left-1 bg-primary text-primary-foreground text-[10px] px-1 rounded font-medium">Principal</span>
              ) : (
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => guardar({ imagenesUrls: [url, ...fotos.filter((u) => u !== url)] }, "Foto principal cambiada")}
                  className="absolute top-1 left-1 h-6 w-6 rounded-full bg-background/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Usar como principal"
                  aria-label="Usar como principal"
                >
                  <Star className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                disabled={ocupado}
                onClick={() => guardar({ imagenesUrls: fotos.filter((u) => u !== url) }, "Foto quitada")}
                className="absolute top-1 right-1 h-6 w-6 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                title="Quitar"
                aria-label="Quitar foto"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {fotos.length < MAXIMO && (
            <div className="aspect-square">
              <FileUpload
                bucket="imagenes"
                accept=".jpg,.jpeg,.png,.webp"
                currentUrl={null}
                onUploaded={(url) => guardar({ imagenesUrls: [...fotos, url] }, "Foto agregada")}
                label={fotos.length === 0 ? "Principal" : `Foto ${fotos.length + 1}`}
                squareCompact
              />
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">Hasta {MAXIMO}. La primera es la que se muestra en las listas.</p>

        <div className="space-y-1.5">
          <p className="text-sm font-medium flex items-center gap-1.5">
            <FileBox className="h-4 w-4 text-violet-500" /> Archivo .3mf
          </p>
          {producto.archivo3mfUrl ? (
            <div className="flex gap-2">
              <a href={producto.archivo3mfUrl} download target="_blank" rel="noopener noreferrer" className="flex-1">
                <Button variant="outline" size="sm" className="w-full gap-2">
                  <Download className="h-3.5 w-3.5" /> Descargar
                </Button>
              </a>
              <Button variant="ghost" size="sm" disabled={ocupado} onClick={() => guardar({ archivo3mfUrl: null }, "Archivo quitado")}>
                Quitar
              </Button>
            </div>
          ) : (
            <FileUpload bucket="modelos-3d" accept=".3mf" currentUrl={null} onUploaded={(url) => guardar({ archivo3mfUrl: url }, "Archivo subido")} label="Subir .3mf" compact />
          )}
        </div>
      </div>
    </Seccion>
  );
}
