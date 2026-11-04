"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { CargosDelMes } from "@/lib/resultado-mes";

const money = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);

/** "2026-11-01" → "9/10 al 8/11": el período de facturación de ML. */
export function textoDePeriodo(clave: string): string {
  const m = Number(clave.split("-")[1]);
  return `9/${m === 1 ? 12 : m - 1} al 8/${m}`;
}

function Fila({
  etiqueta,
  signo,
  monto,
  fuerte,
  extra,
  children,
}: {
  etiqueta: string;
  signo?: "+" | "−";
  monto: number;
  fuerte?: boolean;
  extra?: ReactNode;
  children?: ReactNode;
}) {
  const [abierta, setAbierta] = useState(false);
  const desplegable = !!children;
  const contenido = (
    <>
      <span className="flex items-center gap-1.5 min-w-0 flex-wrap">
        <span className="w-4 shrink-0 text-muted-foreground">
          {desplegable && (abierta ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />)}
        </span>
        <span className={fuerte ? "font-semibold" : ""}>{etiqueta}</span>
        {extra}
      </span>
      <span className={`tabular-nums shrink-0 ${fuerte ? "font-semibold" : ""} ${signo === "−" ? "text-muted-foreground" : ""}`}>
        {signo ? `${signo} ` : ""}
        {money(monto)}
      </span>
    </>
  );
  const clase = `flex w-full items-center justify-between gap-3 py-2 text-sm text-left ${fuerte ? "border-t" : ""}`;
  return (
    <div>
      {desplegable ? (
        <button type="button" onClick={() => setAbierta(!abierta)} aria-expanded={abierta} className={`${clase} rounded hover:bg-muted/40`}>
          {contenido}
        </button>
      ) : (
        <div className={clase}>{contenido}</div>
      )}
      {desplegable && abierta && <div className="pb-2 pl-6 space-y-1 text-xs text-muted-foreground">{children}</div>}
    </div>
  );
}

function Detalle({ etiqueta, monto, signo }: { etiqueta: string; monto: number; signo?: "+" | "−" }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{etiqueta}</span>
      <span className="tabular-nums shrink-0">
        {signo ? `${signo} ` : ""}
        {money(monto)}
      </span>
    </div>
  );
}

/**
 * De lo cobrado a la ganancia neta, de arriba abajo (docs/sdd/007). Los renglones de ML son lo que
 * dice su facturación: la etiqueta avisa cuando todavía no hay dato definitivo.
 */
export function ResultadoDelMes({
  nombreMes,
  cobrado,
  pedidos,
  costoFab,
  bruta,
  gastosEmp,
  gastosFab,
  neta,
  cargos,
}: {
  nombreMes: string;
  cobrado: number;
  pedidos: number;
  costoFab: number;
  bruta: number;
  gastosEmp: number;
  gastosFab: number;
  neta: number;
  cargos: CargosDelMes;
}) {
  const { publicidad: pub, percepciones: per, otros, shay } = cargos;
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <p className="text-sm text-muted-foreground">Ganancia neta de {nombreMes}</p>
        <p className={`text-4xl font-bold tabular-nums mt-1 ${neta >= 0 ? "text-emerald-500" : "text-red-500"}`}>{money(neta)}</p>

        <div className="mt-4 divide-y divide-transparent">
          <Fila etiqueta={`Cobrado (${pedidos} ${pedidos === 1 ? "pedido" : "pedidos"})`} monto={cobrado} />
          <Fila etiqueta="Costo de fabricación" signo="−" monto={costoFab} />
          <Fila etiqueta="Ganancia bruta" monto={bruta} fuerte />

          <Fila etiqueta="Publicidad" signo="−" monto={pub.total}>
            <Detalle etiqueta="Product Ads, con IVA" monto={pub.productAds} />
            {pub.seguidores > 0 && <Detalle etiqueta="Publicidad de Seguidores, con IVA" monto={pub.seguidores} />}
            {pub.anulaciones > 0 && <Detalle etiqueta="Anulado por ML" signo="−" monto={pub.anulaciones} />}
            {pub.sinCampana > 0 && (
              <p className="pt-1">De Product Ads, {money(pub.sinCampana)} no coinciden con ninguna campaña: ML los cobró, pero no se sabe de cuál son.</p>
            )}
          </Fila>

          <Fila
            etiqueta="Percepciones"
            signo="−"
            monto={per.total}
            extra={
              per.estado === "ml" ? null : (
                <Badge variant="outline" className="h-5 px-1.5 text-[10px] border-amber-500/50 text-amber-600 dark:text-amber-400">
                  {per.estado === "aproximada" ? "Aproximado" : "Sin informar"}
                </Badge>
              )
            }
          >
            {per.estado === "ml" && (
              <>
                <p>Período de ML del {textoDePeriodo(per.periodo)}.</p>
                {per.detalle.map((d) => (
                  <Detalle key={d.concepto} etiqueta={d.concepto} monto={d.monto} />
                ))}
              </>
            )}
            {per.estado === "aproximada" && <p>Lo cargado a mano en /shay. ML da el número definitivo al cerrar el período del {textoDePeriodo(per.periodo)}, y ahí se reemplaza solo.</p>}
            {per.estado === "pendiente" && <p>ML las informa al cerrar el período del {textoDePeriodo(per.periodo)}. Hasta entonces la ganancia neta no las descuenta.</p>}
          </Fila>

          <Fila etiqueta="Otros cargos de ML" signo="−" monto={otros.total}>
            {otros.detalle.length === 0 && <p>Sin cargos este mes.</p>}
            {otros.detalle.map((d) => (
              <Detalle key={d.concepto} etiqueta={d.concepto} monto={d.monto} />
            ))}
          </Fila>

          <Fila
            etiqueta="Lo que paga Shay"
            signo="+"
            monto={shay.total}
            extra={
              shay.hayCierre ? null : (
                <Badge variant="outline" className="h-5 px-1.5 text-[10px] border-amber-500/50 text-amber-600 dark:text-amber-400">
                  Sin cierre
                </Badge>
              )
            }
          >
            {shay.hayCierre ? (
              <>
                <Detalle etiqueta="Sus campañas de publicidad" monto={shay.publicidad} />
                <Detalle etiqueta={`Sus percepciones (${(shay.proporcion * 100).toLocaleString("es-AR", { maximumFractionDigits: 2 })} % de lo vendido)`} monto={shay.percepciones} />
              </>
            ) : (
              <p>
                Este mes todavía no tiene cierre en{" "}
                <Link href="/shay" className="underline underline-offset-2">
                  Shay Juguetes
                </Link>
                .
              </p>
            )}
          </Fila>

          <Fila etiqueta="Gastos empresariales" signo="−" monto={gastosEmp} />
          <Fila etiqueta="Ganancia neta" monto={neta} fuerte />
        </div>

        {gastosFab > 0 && <p className="mt-2 text-xs text-muted-foreground">Los {money(gastosFab)} de gastos de fabricación salen de esa billetera, que se llena con el costo de fabricación de cada venta.</p>}
      </CardContent>
    </Card>
  );
}
