import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { BarraSuperior } from "@/components/barra-superior";
import { CommandPalette } from "@/components/command-palette";
import { CurrentUserProvider } from "@/components/current-user-provider";
import { CuentaActivaProvider } from "@/components/cuenta-activa";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CurrentUserProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <CuentaActivaProvider>
            <BarraSuperior />
            <main className="flex-1 p-4 md:p-8">{children}</main>
          </CuentaActivaProvider>
        </SidebarInset>
        <CommandPalette />
      </SidebarProvider>
    </CurrentUserProvider>
  );
}
