"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Box,
  ShoppingCart,
  Factory,
  Users,
  Palette,
  DollarSign,
  Receipt,
  History,
  LogOut,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

const navPrincipal = [
  { title: "Panel", href: "/", icon: LayoutDashboard },
  { title: "Pedidos", href: "/pedidos", icon: ShoppingCart },
  { title: "Producción", href: "/produccion", icon: Factory },
];

const navCatalogo = [
  { title: "Productos", href: "/productos", icon: Package },
  { title: "Modelos", href: "/modelos", icon: Box },
  { title: "Filamentos", href: "/filamentos", icon: Palette },
];

const navNegocio = [
  { title: "Clientes", href: "/clientes", icon: Users },
  { title: "Finanzas", href: "/finanzas", icon: DollarSign },
  { title: "Gastos", href: "/gastos", icon: Receipt },
  { title: "Historial", href: "/historial", icon: History },
];

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const renderGroup = (label: string, items: typeof navPrincipal) => (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                isActive={isActive(item.href)}
                render={<Link href={item.href} />}
              >
                <item.icon className="h-4 w-4" />
                <span>{item.title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-lg font-bold text-primary">Sendero 3D</span>
          <ThemeToggle />
        </div>
      </SidebarHeader>

      <SidebarContent>
        {renderGroup("Principal", navPrincipal)}
        {renderGroup("Catálogo", navCatalogo)}
        {renderGroup("Negocio", navNegocio)}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
              <span>Cerrar sesión</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
