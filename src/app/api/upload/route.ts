import { supabaseAdmin } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

// Buckets permitidos y sus tipos MIME
const BUCKETS: Record<string, { mimes: string[]; maxMB: number }> = {
  "modelos-3d": {
    mimes: ["application/octet-stream", "application/3mf", "model/3mf"],
    maxMB: 50,
  },
  "imagenes": {
    mimes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    maxMB: 10,
  },
  "comprobantes": {
    mimes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
    maxMB: 10,
  },
};

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const bucket = formData.get("bucket") as string | null;

  if (!file || !bucket) {
    return NextResponse.json({ error: "Falta archivo o bucket" }, { status: 400 });
  }

  const config = BUCKETS[bucket];
  if (!config) {
    return NextResponse.json({ error: "Bucket no válido" }, { status: 400 });
  }

  // Validar tamaño
  if (file.size > config.maxMB * 1024 * 1024) {
    return NextResponse.json(
      { error: `El archivo supera el límite de ${config.maxMB}MB` },
      { status: 400 }
    );
  }

  // Para archivos .3mf el browser puede reportar tipo genérico
  const isModel3D = bucket === "modelos-3d" && file.name.endsWith(".3mf");
  if (!isModel3D && !config.mimes.includes(file.type)) {
    return NextResponse.json(
      { error: `Tipo de archivo no permitido: ${file.type}` },
      { status: 400 }
    );
  }

  // Generar nombre único
  const ext = file.name.split(".").pop() || "bin";
  const timestamp = Date.now();
  const safeName = file.name
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .substring(0, 50);
  const filePath = `${safeName}_${timestamp}.${ext}`;

  // Subir a Supabase Storage
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await supabaseAdmin.storage
    .from(bucket)
    .upload(filePath, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (error) {
    console.error("Error subiendo archivo:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Obtener URL pública
  const { data: urlData } = supabaseAdmin.storage
    .from(bucket)
    .getPublicUrl(filePath);

  return NextResponse.json({
    url: urlData.publicUrl,
    path: filePath,
    bucket,
  });
}

// DELETE - eliminar archivo
export async function DELETE(request: NextRequest) {
  const { bucket, path } = await request.json();

  if (!bucket || !path) {
    return NextResponse.json({ error: "Falta bucket o path" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.storage
    .from(bucket)
    .remove([path]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
