"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  LayoutDashboard, Tag, Box, ShoppingCart, Factory, Users, Palette,
  DollarSign, Receipt, History, Radar, Search,
} from "lucide-react";

const pages = [
  { name: "Panel", href: "/", icon: LayoutDashboard, keywords: "dashboard inicio home panel" },
  { name: "Pedidos", href: "/pedidos", icon: ShoppingCart, keywords: "pedidos ordenes ventas" },
  { name: "Produccion", href: "/produccion", icon: Factory, keywords: "produccion cola impresion fabricar" },
  { name: "Categorias", href: "/categorias", icon: Tag, keywords: "categorias productos tipos" },
  { name: "Modelos", href: "/modelos", icon: Box, keywords: "modelos 3d stl diseños" },
  { name: "Filamentos", href: "/filamentos", icon: Palette, keywords: "filamentos material pla abs petg" },
  { name: "Clientes", href: "/clientes", icon: Users, keywords: "clientes contactos personas" },
  { name: "Tendencias", href: "/tendencias", icon: Radar, keywords: "tendencias eventos radar viral" },
  { name: "Finanzas", href: "/finanzas", icon: DollarSign, keywords: "finanzas dinero ingresos ganancia" },
  { name: "Gastos", href: "/gastos", icon: Receipt, keywords: "gastos costos compras" },
  { name: "Historial", href: "/historial", icon: History, keywords: "historial completados archivo" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const navigate = useCallback((href: string) => {
    setOpen(false);
    router.push(href);
  }, [router]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />
      {/* Dialog */}
      <div className="absolute left-1/2 top-[20%] -translate-x-1/2 w-full max-w-[520px] px-4">
        <Command
          className="rounded-xl border bg-popover text-popover-foreground shadow-2xl overflow-hidden"
          loop
        >
          <div className="flex items-center border-b px-3 gap-2">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Command.Input
              autoFocus
              placeholder="Buscar secciones..."
              className="flex h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
              ESC
            </kbd>
          </div>
          <Command.List className="max-h-[300px] overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              Sin resultados.
            </Command.Empty>
            <Command.Group heading="Navegacion" className="text-xs text-muted-foreground px-2 py-1.5">
              {pages.map((page) => (
                <Command.Item
                  key={page.href}
                  value={`${page.name} ${page.keywords}`}
                  onSelect={() => navigate(page.href)}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm cursor-pointer aria-selected:bg-accent aria-selected:text-accent-foreground"
                >
                  <page.icon className="h-4 w-4 text-muted-foreground" />
                  <span>{page.name}</span>
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
