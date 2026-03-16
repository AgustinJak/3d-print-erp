"use client";

import { useState, useRef } from "react";
import { Upload, X, FileBox, Image as ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

// Límites por bucket
const BUCKET_LIMITS: Record<string, number> = {
  "modelos-3d": 50,
  imagenes: 10,
  comprobantes: 10,
};

interface FileUploadProps {
  bucket: "modelos-3d" | "imagenes" | "comprobantes";
  accept: string;
  currentUrl?: string | null;
  onUploaded: (url: string) => void;
  onRemoved?: () => void;
  label?: string;
  compact?: boolean;
}

export function FileUpload({
  bucket,
  accept,
  currentUrl,
  onUploaded,
  onRemoved,
  label = "Subir archivo",
  compact = false,
}: FileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setError(null);

    // Validar tamaño
    const maxMB = BUCKET_LIMITS[bucket] || 10;
    if (file.size > maxMB * 1024 * 1024) {
      setError(`El archivo supera el límite de ${maxMB}MB`);
      setUploading(false);
      return;
    }

    try {
      const supabase = createClient();

      // Generar nombre único
      const ext = file.name.split(".").pop() || "bin";
      const timestamp = Date.now();
      const safeName = file.name
        .replace(/\.[^/.]+$/, "")
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .substring(0, 50);
      const filePath = `${safeName}_${timestamp}.${ext}`;

      // Subir directo a Supabase Storage (no pasa por API route → sin límite 4.5MB de Vercel)
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });

      if (uploadError) {
        setError(uploadError.message);
        return;
      }

      // Obtener URL pública
      const { data: urlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(filePath);

      onUploaded(urlData.publicUrl);
    } catch {
      setError("Error de conexión");
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = () => {
    if (onRemoved) onRemoved();
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    if (uploading) return;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    // Validate extension against accept prop
    const acceptedExts = accept.split(",").map(a => a.trim().toLowerCase());
    const fileExt = "." + file.name.split(".").pop()?.toLowerCase();
    if (!acceptedExts.some(ext => ext === fileExt || ext === file.type)) {
      setError(`Formato no permitido. Se acepta: ${accept}`);
      return;
    }
    handleUpload(file);
  };

  const isImage = currentUrl && (currentUrl.match(/\.(jpg|jpeg|png|webp|gif)$/i) || bucket === "imagenes");
  const is3mf = currentUrl && (currentUrl.endsWith(".3mf") || bucket === "modelos-3d");

  if (compact) {
    return (
      <div className="space-y-1">
        {currentUrl ? (
          <div className="flex items-center gap-2">
            {isImage ? (
              <img src={currentUrl} alt="" className="h-8 w-8 rounded object-cover" />
            ) : is3mf ? (
              <FileBox className="h-4 w-4 text-violet-500" />
            ) : (
              <ImageIcon className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="text-xs text-muted-foreground truncate max-w-[200px]" title={currentUrl.split("/").pop()}>
              {currentUrl.split("/").pop()}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={handleRemove}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <Upload className="h-3 w-3 mr-1" />
            )}
            {label}
          </Button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
          }}
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {currentUrl ? (
        <div className="relative rounded-lg border p-3">
          <div className="flex items-center gap-3">
            {isImage ? (
              <img src={currentUrl} alt="" className="h-16 w-16 rounded object-cover" />
            ) : is3mf ? (
              <div className="h-16 w-16 rounded bg-violet-500/10 flex items-center justify-center">
                <FileBox className="h-8 w-8 text-violet-500" />
              </div>
            ) : (
              <div className="h-16 w-16 rounded bg-muted flex items-center justify-center">
                <ImageIcon className="h-8 w-8 text-muted-foreground" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {decodeURIComponent(currentUrl.split("/").pop() || "")}
              </p>
              <p className="text-xs text-muted-foreground">{bucket}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-red-500"
              onClick={handleRemove}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        <div
          className={`relative rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
            dragging
              ? "border-primary bg-primary/5 scale-[1.01]"
              : "hover:border-primary/50"
          }`}
          onClick={() => !uploading && inputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragEnter={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Subiendo...</p>
            </div>
          ) : dragging ? (
            <div className="flex flex-col items-center gap-2">
              <Upload className="h-8 w-8 text-primary" />
              <p className="text-sm font-medium text-primary">Soltar para subir</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="text-xs text-muted-foreground">
                {accept.replace(/\./g, "").replace(/,/g, ", ").toUpperCase()} · o hacé click
              </p>
            </div>
          )}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
        }}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
