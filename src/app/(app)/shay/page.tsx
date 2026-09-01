"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShayCard } from "./shay-card";

/**
 * Shay Juguetes: el reparto de la cuenta de Mercado Libre compartida.
 *
 * Vive fuera de Finanzas a propósito. Esta plata **no es del negocio**: entra a
 * la misma cuenta pero hay que pasársela, y mezclarla con los números propios
 * confunde las dos cosas.
 */

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export default function ShayPage() {
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [anio, setAnio] = useState(new Date().getFullYear());

  const mesAnterior = () => {
    if (mes === 1) { setMes(12); setAnio(anio - 1); } else setMes(mes - 1);
  };
  const mesSiguiente = () => {
    if (mes === 12) { setMes(1); setAnio(anio + 1); } else setMes(mes + 1);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Store className="h-6 w-6" /> Shay Juguetes
          </h1>
          <p className="text-sm text-muted-foreground">
            Lo que vendió en la cuenta compartida y cuánto hay que pasarle.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="icon" onClick={() => setAnio(anio - 1)} title="Año anterior">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={mesAnterior} title="Mes anterior">
            <ArrowLeft className="h-3 w-3" />
          </Button>
          <span className="text-sm font-medium min-w-[140px] text-center">
            {MESES[mes - 1]} <span className="font-bold">{anio}</span>
          </span>
          <Button variant="outline" size="icon" onClick={mesSiguiente} title="Mes siguiente">
            <ArrowRight className="h-3 w-3" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => setAnio(anio + 1)} title="Año siguiente">
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ShayCard mes={mes} anio={anio} nombreMes={MESES[mes - 1]} />
    </div>
  );
}
