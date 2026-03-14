// Script para crear las políticas de Storage que permiten uploads desde el cliente
// Ejecutar: npx tsx scripts/setup-storage-policies.ts

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BUCKETS = ["modelos-3d", "imagenes", "comprobantes"];

async function setup() {
  for (const bucket of BUCKETS) {
    // Política: usuarios autenticados pueden subir archivos
    const { error: insertError } = await supabase.rpc("exec_sql", {
      sql: `
        DO $$
        BEGIN
          -- INSERT (upload)
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies WHERE policyname = '${bucket}_insert_auth' AND tablename = 'objects'
          ) THEN
            CREATE POLICY "${bucket}_insert_auth"
            ON storage.objects FOR INSERT
            TO authenticated
            WITH CHECK (bucket_id = '${bucket}');
          END IF;

          -- SELECT (read/download) - público
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies WHERE policyname = '${bucket}_select_public' AND tablename = 'objects'
          ) THEN
            CREATE POLICY "${bucket}_select_public"
            ON storage.objects FOR SELECT
            TO public
            USING (bucket_id = '${bucket}');
          END IF;

          -- UPDATE (overwrite)
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies WHERE policyname = '${bucket}_update_auth' AND tablename = 'objects'
          ) THEN
            CREATE POLICY "${bucket}_update_auth"
            ON storage.objects FOR UPDATE
            TO authenticated
            USING (bucket_id = '${bucket}');
          END IF;

          -- DELETE
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies WHERE policyname = '${bucket}_delete_auth' AND tablename = 'objects'
          ) THEN
            CREATE POLICY "${bucket}_delete_auth"
            ON storage.objects FOR DELETE
            TO authenticated
            USING (bucket_id = '${bucket}');
          END IF;
        END $$;
      `,
    });

    if (insertError) {
      // Fallback: usar SQL directo via REST
      console.log(`Intentando vía SQL directo para "${bucket}"...`);

      const policies = [
        {
          name: `${bucket}_insert_auth`,
          operation: "INSERT",
          role: "authenticated",
          check: `bucket_id = '${bucket}'`,
        },
        {
          name: `${bucket}_select_public`,
          operation: "SELECT",
          role: "public",
          check: `bucket_id = '${bucket}'`,
        },
        {
          name: `${bucket}_update_auth`,
          operation: "UPDATE",
          role: "authenticated",
          check: `bucket_id = '${bucket}'`,
        },
        {
          name: `${bucket}_delete_auth`,
          operation: "DELETE",
          role: "authenticated",
          check: `bucket_id = '${bucket}'`,
        },
      ];

      for (const policy of policies) {
        const isWrite = ["INSERT"].includes(policy.operation);
        const sql = isWrite
          ? `CREATE POLICY "${policy.name}" ON storage.objects FOR ${policy.operation} TO ${policy.role} WITH CHECK (${policy.check});`
          : `CREATE POLICY "${policy.name}" ON storage.objects FOR ${policy.operation} TO ${policy.role} USING (${policy.check});`;

        const res = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/exec_sql`,
          {
            method: "POST",
            headers: {
              apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
              Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ sql }),
          }
        );

        if (res.ok) {
          console.log(`  ✓ Política "${policy.name}" creada`);
        } else {
          const text = await res.text();
          if (text.includes("already exists")) {
            console.log(`  ✓ Política "${policy.name}" ya existe`);
          } else {
            console.log(`  ✗ Error: ${text}`);
          }
        }
      }
    } else {
      console.log(`✓ Políticas para "${bucket}" creadas`);
    }
  }

  console.log("\n¡Políticas de storage configuradas!");
  console.log("Los usuarios autenticados ahora pueden subir archivos directamente.");
}

setup();
