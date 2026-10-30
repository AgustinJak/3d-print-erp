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
  Store,
  BadgeDollarSign,
  Megaphone,
  Percent,
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

// Agrupado por tarea del día (Agustín, 2026-10-30): vender, producir, armar el catálogo, ponerle
// precio y vender en los canales, la plata.
const navInicio = [{ title: "Panel", href: "/", icon: LayoutDashboard }];

const navVentas = [
  { title: "Pedidos", href: "/pedidos", icon: ShoppingCart },
  { title: "Historial de pedidos", href: "/historial", icon: History },
  { title: "Clientes", href: "/clientes", icon: Users },
];

const navTaller = [
  { title: "Producción", href: "/produccion", icon: Factory },
  { title: "Stock", href: "/stock", icon: Boxes },
  { title: "Filamentos", href: "/filamentos", icon: Palette },
];

const navCatalogo = [
  { title: "Productos", href: "/modelos", icon: Box },
  { title: "Categorías", href: "/categorias", icon: Tag },
  { title: "Tendencias", href: "/tendencias", icon: Radar },
];

// Lo que se publica en Mercado Libre y la web. Oculto en la cuenta demo: sus endpoints no la atienden.
const navCanales = [
  { title: "Precios", href: "/precios", icon: BadgeDollarSign },
  { title: "Promos", href: "/promos", icon: Percent },
  { title: "Publicidad", href: "/publicidad", icon: Megaphone },
];

const navPlata = [
  { title: "Finanzas", href: "/finanzas", icon: DollarSign },
  { title: "Gastos", href: "/gastos", icon: Receipt },
  { title: "Shay Juguetes", href: "/shay", icon: Store },
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

  const renderGroup = (label: string | null, items: typeof navInicio) => (
    <SidebarGroup>
      {label && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
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
        {renderGroup(null, navInicio)}
        {renderGroup("Ventas", navVentas)}
        {renderGroup("Taller", navTaller)}
        {renderGroup("Catálogo", navCatalogo)}
        {!isDemo && renderGroup("Mercado Libre y web", navCanales)}
        {renderGroup("Plata", navPlata)}
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
