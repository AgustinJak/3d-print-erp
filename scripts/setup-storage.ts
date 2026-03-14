// Script para crear los buckets de storage en Supabase
// Ejecutar: npx tsx scripts/setup-storage.ts

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BUCKETS = [
  { id: "modelos-3d", name: "Modelos 3D", public: true },
  { id: "imagenes", name: "Imágenes de productos", public: true },
  { id: "comprobantes", name: "Comprobantes de pago", public: true },
];

async function setup() {
  for (const bucket of BUCKETS) {
    const { error } = await supabase.storage.createBucket(bucket.id, {
      public: bucket.public,
    });

    if (error) {
      if (error.message.includes("already exists")) {
        console.log(`✓ Bucket "${bucket.id}" ya existe`);
      } else {
        console.error(`✗ Error creando "${bucket.id}":`, error.message);
      }
    } else {
      console.log(`✓ Bucket "${bucket.id}" creado`);
    }
  }

  console.log("\n¡Storage configurado!");
}

setup();
