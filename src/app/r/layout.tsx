import type { Metadata, Viewport } from "next";

/** El link del repartidor (docs/sdd/018): sin menú del ERP, sin indexar, para el celular. */
export const metadata: Metadata = {
  title: "Envíos del día",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function LayoutRepartidor({ children }: { children: React.ReactNode }) {
  return children;
}
