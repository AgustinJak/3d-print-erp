"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Tag,
  Box,
  ShoppingCart,
  Factory,
  Users,
  Palette, Boxes,
  DollarSign,
  Receipt,
  History,
  LogOut,
  Radar,
  Plug,
  Home,
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
  useSidebar,
} from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useIsDemoTenant } from "@/components/current-user-provider";

const navPrincipal = [
  { title: "Panel", href: "/", icon: LayoutDashboard },
  { title: "Pedidos", href: "/pedidos", icon: ShoppingCart },
  { title: "Producción", href: "/produccion", icon: Factory },
];

const navCatalogo = [
  { title: "Categorías", href: "/categorias", icon: Tag },
  { title: "Modelos", href: "/modelos", icon: Box },
  { title: "Filamentos", href: "/filamentos", icon: Palette },
  { title: "Stock", href: "/stock", icon: Boxes },
];

const navNegocio = [
  { title: "Clientes", href: "/clientes", icon: Users },
  { title: "Tendencias", href: "/tendencias", icon: Radar },
  { title: "Finanzas", href: "/finanzas", icon: DollarSign },
  { title: "Gastos", href: "/gastos", icon: Receipt },
  { title: "Historial", href: "/historial", icon: History },
];

const navSistema = [
  { title: "Integraciones", href: "/integraciones", icon: Plug },
];

const navPersonal = [
  { title: "Casa", href: "/casa", icon: Home },
];

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { isMobile, setOpenMobile } = useSidebar();
  const isDemo = useIsDemoTenant();

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

  const handleNav = (href: string) => {
    if (isMobile) setOpenMobile(false);
    router.push(href);
  };

  const renderGroup = (label: string, items: typeof navPrincipal) => (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                className="cursor-pointer"
                isActive={isActive(item.href)}
                onClick={() => handleNav(item.href)}
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
          <Link href="/" className="text-lg font-bold text-primary hover:opacity-80 transition-opacity">Sendero 3D</Link>
          <ThemeToggle />
        </div>
      </SidebarHeader>

      <SidebarContent>
        {renderGroup("Principal", navPrincipal)}
        {renderGroup("Catálogo", navCatalogo)}
        {renderGroup("Negocio", navNegocio)}
        {!isDemo && renderGroup("Sistema", navSistema)}
        {!isDemo && renderGroup("Personal", navPersonal)}
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
