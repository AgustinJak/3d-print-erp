import { getAuthenticatedTenant } from "@/lib/tenant";
import { redirect } from "next/navigation";

/**
 * La sección Integraciones no está disponible para la cuenta demo.
 * Si un usuario demo intenta acceder, lo redirigimos al dashboard.
 */
export default async function IntegracionesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let tenantId: string | null = null;
  try {
    const auth = await getAuthenticatedTenant();
    tenantId = auth.tenantId;
  } catch {
    redirect("/login");
  }

  if (tenantId === "demo") {
    redirect("/");
  }

  return <>{children}</>;
}
