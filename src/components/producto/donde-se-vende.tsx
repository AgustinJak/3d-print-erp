"use client";

import Link from "next/link";
import { ExternalLink, Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Seccion } from "@/components/producto/seccion";
import type { Ficha } from "@/app/api/modelos/[id]/ficha/route";

const CANAL: Record<string, string> = { mercadolibre: "Mercado Libre", shop: "Shop" };

/** "MLA1234" → la publicación en Mercado Libre. */
const urlMl = (mla: string) => `https://articulo.mercadolibre.com.ar/${mla.replace(/^MLA/i, "MLA-")}`;

/**
 * Dónde se vende (spec 004): las publicaciones de ML vinculadas y las claves de cada canal que
 * llegan a este producto. Sólo lectura: el mapeo se cambia en Integraciones › Mapeo.
 */
export function SeccionDondeSeVende({ ficha }: { ficha: Ficha }) {
  const { publicaciones, claves } = ficha.canales;
  const porCanal = new Map<string, typeof claves>();
  for (const k of claves) porCanal.set(k.canal, [...(porCanal.get(k.canal) ?? []), k]);

  return (
    <Seccion
      titulo="Dónde se vende"
      icono={Store}
      acciones={
        <Link href="/integraciones" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          Integraciones › Mapeo <ExternalLink className="h-3 w-3" />
        </Link>
      }
    >
      {publicaciones.length === 0 && claves.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no se vendió por ningún canal.</p>
      ) : (
        <div className="space-y-3">
          {publicaciones.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Publicaciones de Mercado Libre</p>
              {publicaciones.map((p) => (
                <a key={p.mla} href={urlMl(p.mla)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm hover:underline">
                  <span className="font-mono text-xs text-muted-foreground shrink-0">{p.mla}</span>
                  <span className="truncate">{p.titulo ?? "—"}</span>
                  <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                </a>
              ))}
            </div>
          )}
          {[...porCanal].map(([canal, ks]) => (
            <div key={canal} className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                {CANAL[canal] ?? canal}: {ks.length} {ks.length === 1 ? "forma de venta reconocida" : "formas de venta reconocidas"}
              </p>
              {ks.map((k) => (
                <div key={k.id} className={`flex items-start justify-between gap-2 text-sm ${k.activa ? "" : "opacity-50"}`}>
                  <span className="min-w-0">{k.descripcion ?? "—"}</span>
                  <span className="flex items-center gap-1.5 shrink-0 text-xs text-muted-foreground">
                    → {k.combinacion}
                    {!k.activa && <Badge variant="outline">se vuelve a resolver en la próxima venta</Badge>}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </Seccion>
  );
}
