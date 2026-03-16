import { getSupabaseAdmin } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Obtiene el tenant_id de un usuario buscando en la tabla `perfiles`.
 * Si no existe un perfil, retorna 'sendero3d' como valor por defecto.
 */
export async function getTenantId(userId: string): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("perfiles")
    .select("tenant_id")
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    return "demo";
  }

  return data.tenant_id as string;
}

/**
 * Obtiene el usuario autenticado y su tenant_id.
 * Lanza un NextResponse 401 si no hay usuario autenticado.
 */
export async function getAuthenticatedTenant(): Promise<{
  user: { id: string; email?: string };
  tenantId: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const tenantId = await getTenantId(user.id);

  return { user: { id: user.id, email: user.email }, tenantId };
}
