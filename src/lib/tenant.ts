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

/**
 * Igual que `getAuthenticatedTenant` pero bloquea explícitamente al tenant demo.
 * Usar en endpoints/funciones que NO deben estar disponibles en la cuenta demo
 * (ej: integración con shop, generador de secrets, etc.)
 */
export async function getAuthenticatedTenantNonDemo(): Promise<{
  user: { id: string; email?: string };
  tenantId: string;
}> {
  const auth = await getAuthenticatedTenant();
  if (auth.tenantId === "demo") {
    throw NextResponse.json(
      { error: "Esta sección no está disponible en la cuenta demo" },
      { status: 403 },
    );
  }
  return auth;
}

/**
 * La Bodega (app de escritorio) llamando al ERP (docs/sdd/017): no tiene cookies de sesión, manda
 * el access token de su sesión de Supabase en `Authorization: Bearer`. Se valida con Supabase y
 * tiene que ser un usuario del taller (`sendero3d`). Las rutas que lo usan pasan el middleware sin
 * cookie (ver `middleware.ts`), así que este chequeo es el único: no lo saltees.
 */
export async function getTenantDeBodega(request: Request): Promise<{ user: { id: string; email?: string }; tenantId: string }> {
  const h = request.headers.get("authorization") ?? "";
  const token = /^Bearer\s+(.+)$/i.exec(h)?.[1]?.trim();
  if (!token) throw NextResponse.json({ error: "Falta la sesión de la Bodega" }, { status: 401 });
  const { data, error } = await getSupabaseAdmin().auth.getUser(token);
  if (error || !data.user) throw NextResponse.json({ error: "Sesión vencida o inválida" }, { status: 401 });
  const tenantId = await getTenantId(data.user.id);
  if (tenantId !== "sendero3d") throw NextResponse.json({ error: "Sólo para el taller" }, { status: 403 });
  return { user: { id: data.user.id, email: data.user.email }, tenantId };
}
