"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dato, json, pedir, pesos, Seccion } from "@/components/producto/seccion";
import { REDONDEOS } from "@/lib/precios-formula";
import type { Ficha } from "@/app/api/modelos/[id]/ficha/route";

/**
 * La política de precio del producto (docs/sdd/006, spec 002): margen, promo de ML, redondeo y
 * precio de ML fijo propios. Vacío = sigue a la general. Es lo que se toca cuando un producto queda
 * barato con el margen general (el collar, Agustín, 2026-10-30).
 *
 * El margen es sobre el precio de venta de ML; la web y personalizados dejan los mismos pesos que
 * ML y nunca menos que ese margen. Los precios que salen se ven y se aplican en Precios.
 */

interface Valores {
  margen: string;
  promoMl: string;
  redondeo: string;
  precioMlFijo: string;
}

const txt = (n: number | null) => (n == null ? "" : String(n));
const desde = (p: Ficha["politica"]): Valores => ({ margen: txt(p.margen), promoMl: txt(p.promoMl), redondeo: p.redondeo ?? "", precioMlFijo: txt(p.precioMlFijo) });
const nombreRedondeo = (id: string) => REDONDEOS.find((r) => r.id === id)?.label ?? id;

export function SeccionPoliticaPrecio({ ficha, onCambio }: { ficha: Ficha; onCambio: () => void }) {
  const p = ficha.politica;
  const g = p.general;
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [v, setV] = useState<Valores>(() => desde(p));
  const sucio = editando && JSON.stringify(v) !== JSON.stringify(desde(p));
  const cambiar = (k: keyof Valores, x: string) => setV((prev) => ({ ...prev, [k]: x }));

  async function guardar() {
    setGuardando(true);
    try {
      await pedir(`/api/modelos/${ficha.producto.id}`, json("PATCH", { margen: v.margen || null, promoMl: v.promoMl || null, redondeo: v.redondeo || null, precioMlFijo: v.precioMlFijo || null }));
      toast.success("Política de precio guardada. Los precios nuevos aparecen en Precios.");
      setEditando(false);
      onCambio();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  const propio = (valor: React.ReactNode, tiene: boolean) => (
    <span className="flex items-center justify-end gap-2">
      {valor}
      <Badge variant="outline" className="font-normal">
        {tiene ? "propio" : "general"}
      </Badge>
    </span>
  );

  return (
    <Seccion
      titulo="Política de precio"
      icono={SlidersHorizontal}
      editando={editando}
      sucio={sucio}
      guardando={guardando}
      onEditar={() => {
        setV(desde(p));
        setEditando(true);
      }}
      onCancelar={() => setEditando(false)}
      onGuardar={guardar}
    >
      {editando ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pp-margen">
                Margen <span className="text-xs text-muted-foreground font-normal">(% sobre el precio)</span>
              </Label>
              <Input id="pp-margen" inputMode="decimal" placeholder={`${g.margen} (general)`} value={v.margen} onChange={(e) => cambiar("margen", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pp-promo">
                Promo de ML <span className="text-xs text-muted-foreground font-normal">(%)</span>
              </Label>
              <Input id="pp-promo" inputMode="decimal" placeholder={`${g.promo} (general)`} value={v.promoMl} onChange={(e) => cambiar("promoMl", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pp-redondeo">Redondeo</Label>
              <select
                id="pp-redondeo"
                value={v.redondeo}
                onChange={(e) => cambiar("redondeo", e.target.value)}
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
              >
                <option value="">{nombreRedondeo(g.redondeo)} (general)</option>
                {REDONDEOS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pp-fijo">
                Precio de ML fijo <span className="text-xs text-muted-foreground font-normal">(publicado)</span>
              </Label>
              <Input id="pp-fijo" inputMode="decimal" placeholder="el de la fórmula" value={v.precioMlFijo} onChange={(e) => cambiar("precioMlFijo", e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Vacío = usa el general. Subir el margen sube el precio en ML, y con él la web y personalizados, que dejan los mismos pesos. El precio fijo deja la
            publicación de ML en ese número aunque gane menos (por ejemplo, para no pasar los $30.000).
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="divide-y">
            <Dato etiqueta="Margen">{propio(`${p.margen ?? g.margen} %`, p.margen != null)}</Dato>
            <Dato etiqueta="Promo de ML">{propio(`${p.promoMl ?? g.promo} %`, p.promoMl != null)}</Dato>
            <Dato etiqueta="Redondeo">{propio(nombreRedondeo(p.redondeo ?? g.redondeo), p.redondeo != null)}</Dato>
            <Dato etiqueta="Precio de ML fijo">{p.precioMlFijo != null ? propio(pesos(p.precioMlFijo), true) : <span className="text-muted-foreground">no, el de la fórmula</span>}</Dato>
          </div>
          {g.origen !== "erp" && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Precios todavía calcula con los gastos de Bodega: la política se usa cuando el ERP tenga su configuración de precios.
            </p>
          )}
          <Link href={`/precios?modelo=${ficha.producto.id}`} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
            Ver los precios que salen <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      )}
    </Seccion>
  );
}
