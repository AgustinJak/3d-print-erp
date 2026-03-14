import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Cliente server-side con service_role (para storage, crear buckets, etc.)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// URL pública para archivos
export function getPublicUrl(bucket: string, path: string) {
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
}
