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
  ListChecks,
  FolderOpen,
  Calculator,
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
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useIsDemoTenant } from "@/components/current-user-provider";

// Agrupado por tarea del día (Agustín, 2026-10-30): vender, producir, armar el catálogo, ponerle
// precio y vender en los canales, la plata.
const navInicio = [
  { title: "Panel", href: "/", icon: LayoutDashboard },
  // Las tareas del día (docs/sdd/012).
  { title: "Tareas", href: "/tareas", icon: ListChecks },
];

const navVentas = [
  { title: "Pedidos", href: "/pedidos", icon: ShoppingCart },
  { title: "Historial de pedidos", href: "/historial", icon: History },
  { title: "Clientes", href: "/clientes", icon: Users },
];

const navTaller = [
  { title: "Producción", href: "/produccion", icon: Factory },
  { title: "Stock", href: "/stock", icon: Boxes },
  { title: "Filamentos", href: "/filamentos", icon: Palette },
  { title: "Archivos 3D", href: "/archivos", icon: FolderOpen },
];

const navCatalogo = [
  { title: "Productos", href: "/modelos", icon: Box },
  { title: "Categorías", href: "/categorias", icon: Tag },
  { title: "Tendencias", href: "/tendencias", icon: Radar },
  // Cotizar una pieza sin crear el producto (docs/sdd/013).
  { title: "Cotizador", href: "/cotizador", icon: Calculator },
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

/** Todas las secciones por grupo: la barra de arriba las usa para decir dónde estás. */
export const GRUPOS_DE_NAVEGACION: Array<{ titulo: string | null; items: typeof navInicio }> = [
  { titulo: null, items: navInicio },
  { titulo: "Ventas", items: navVentas },
  { titulo: "Taller", items: navTaller },
  { titulo: "Catálogo", items: navCatalogo },
  { titulo: "Mercado Libre y web", items: navCanales },
  { titulo: "Plata", items: navPlata },
  { titulo: "Sistema", items: navSistema },
  { titulo: "Personal", items: navPersonal },
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
                className="cursor-pointer text-sidebar-foreground/80 data-active:text-sidebar-foreground"
                isActive={isActive(item.href)}
                tooltip={item.title}
                onClick={() => handleNav(item.href)}
              >
                <item.icon className="h-4 w-4" strokeWidth={1.5} />
                <span>{item.title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-14 justify-center border-b border-sidebar-border px-3">
        <Link href="/" className="flex items-center gap-2.5 rounded-md px-1 transition-opacity hover:opacity-80" title="Sendero 3D">
          {/* La marca: un bloque naranja filamento, como una pieza en la cama de impresión. */}
          <span aria-hidden className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-primary text-[11px] font-semibold text-primary-foreground">S</span>
          <span className="truncate text-[15px] font-semibold group-data-[collapsible=icon]:hidden">Sendero 3D</span>
        </Link>
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
            <SidebarMenuButton onClick={handleLogout} tooltip="Cerrar sesión" className="text-sidebar-foreground/70">
              <LogOut className="h-4 w-4" strokeWidth={1.5} />
              <span>Cerrar sesión</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
