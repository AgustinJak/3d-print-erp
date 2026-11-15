"use client";

import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { SelectorDeCuenta } from "@/components/cuenta-activa";
import { ThemeToggle } from "@/components/theme-toggle";
import { GRUPOS_DE_NAVEGACION } from "@/components/app-sidebar";
import { abrirBuscador } from "@/components/command-palette";

/**
 * La barra de arriba de toda la app (docs/sdd/011): dónde estás, el selector de cuenta de ML en las
 * secciones donde importa, el buscador y el tema. El selector vive acá y no en cada página, así
 * siempre está en el mismo lugar.
 */

/** Las secciones donde la cuenta de ML cambia lo que se ve o lo que se aplica. */
const CON_CUENTA = ["/modelos", "/precios", "/promos", "/pedidos", "/historial", "/finanzas"];

function dondeEstoy(pathname: string): { grupo: string | null; pagina: string } | null {
  for (const g of GRUPOS_DE_NAVEGACION) {
    for (const item of g.items) {
      const activa = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);
      if (activa) return { grupo: g.titulo, pagina: item.title };
    }
  }
  return null;
}

export function BarraSuperior() {
  const pathname = usePathname();
  const lugar = dondeEstoy(pathname);
  const conCuenta = CON_CUENTA.some((r) => pathname === r || pathname.startsWith(`${r}/`));

  return (
    <>
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b bg-background/95 px-4 supports-[backdrop-filter]:bg-background/80 supports-[backdrop-filter]:backdrop-blur md:px-6">
      <SidebarTrigger className="-ml-1 text-muted-foreground" />
      <nav aria-label="Ubicación" className="flex min-w-0 items-center gap-1.5 text-sm">
        {lugar?.grupo && (
          <>
            <span className="hidden text-muted-foreground sm:inline">{lugar.grupo}</span>
            <span className="hidden text-muted-foreground/60 sm:inline">/</span>
          </>
        )}
        <span className="truncate font-medium">{lugar?.pagina ?? ""}</span>
      </nav>

      <div className="ml-auto flex items-center gap-2">
        {conCuenta && <SelectorDeCuenta className="hidden md:inline-flex" />}
        <button
          type="button"
          onClick={abrirBuscador}
          className="inline-flex h-8 items-center gap-2 rounded-lg border bg-muted/50 pl-2.5 pr-1.5 text-sm text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
        >
          <Search className="h-4 w-4" strokeWidth={1.5} />
          <span className="hidden lg:inline">Buscar</span>
          <kbd className="hidden h-5 items-center rounded border bg-background px-1.5 font-mono text-[11px] lg:inline-flex">Ctrl K</kbd>
        </button>
        <ThemeToggle />
      </div>
    </header>
    {/* En el teléfono el selector no entra en la barra: va en una fila debajo. */}
    {conCuenta && (
      <div className="border-b px-4 py-2 md:hidden">
        <SelectorDeCuenta />
      </div>
    )}
    </>
  );
}
