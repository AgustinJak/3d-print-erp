"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ArchivoDePiezaBloque, type InfoDePiezas } from "@/components/producto/archivo-de-pieza";
import { pedir } from "@/components/producto/seccion";
import type { PiezaACompletar } from "@/lib/piezas-a-completar";

/**
 * Piezas (docs/sdd/014): el archivo y la receta de cada pieza que usan los productos activos y
 * los insumos, de lo más vendido a lo menos, para completar lo que falta. Sin receta el costo no
 * se calcula. Cada fila se completa ahí mismo con el bloque de la página del producto.
 */

type Filtro = "completar" | "receta" | "archivo" | "todas";

const FILTROS: Array<{ id: Filtro; nombre: string }> = [
  { id: "completar", nombre: "A completar" },
  { id: "receta", nombre: "Sin receta" },
  { id: "archivo", nombre: "Sin archivo" },
  { id: "todas", nombre: "Todas" },
];

const VACIO: InfoDePiezas = { archivos: {}, recetas: {}, materiales: [] };

/** La lista y, de esas piezas, el archivo, la receta y los materiales. */
async function traer(): Promise<[PiezaACompletar[], InfoDePiezas]> {
  const { piezas } = await pedir<{ piezas: PiezaACompletar[] }>("/api/piezas/completar");
  const ids = piezas.map((p) => p.id).join(",");
  return [piezas, ids ? await pedir<InfoDePiezas>(`/api/piezas?ids=${encodeURIComponent(ids)}`) : VACIO];
}

export default function PiezasPage() {
  const [piezas, setPiezas] = useState<PiezaACompletar[] | null>(null);
  const [info, setInfo] = useState<InfoDePiezas>(VACIO);
  const [filtro, setFiltro] = useState<Filtro>("completar");
  const [buscar, setBuscar] = useState("");

  const cargar = useCallback(
    () =>
      traer()
        .then(([lista, datos]) => {
          setPiezas(lista);
          setInfo(datos);
        })
        .catch(() => setPiezas((p) => p ?? [])),
    []
  );

  useEffect(() => {
    let vigente = true;
    traer()
      .then(([lista, datos]) => {
        if (!vigente) return;
        setPiezas(lista);
        setInfo(datos);
      })
      .catch(() => vigente && setPiezas([]));
    return () => {
      vigente = false;
    };
  }, []);

  const cuentas = useMemo(() => {
    const l = piezas ?? [];
    return {
      total: l.length,
      sinReceta: l.filter((p) => !p.tieneReceta).length,
      sinArchivo: l.filter((p) => !p.tieneArchivo).length,
      completas: l.filter((p) => p.tieneReceta && p.tieneArchivo).length,
    };
  }, [piezas]);

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return (piezas ?? []).filter((p) => {
      if (filtro === "completar" && p.tieneReceta && p.tieneArchivo) return false;
      if (filtro === "receta" && p.tieneReceta) return false;
      if (filtro === "archivo" && p.tieneArchivo) return false;
      return !q || (p.etiqueta ?? p.nombre).toLowerCase().includes(q) || p.producto.toLowerCase().includes(q);
    });
  }, [piezas, filtro, buscar]);

  const cantidadDe = (f: Filtro) =>
    f === "completar" ? cuentas.total - cuentas.completas : f === "receta" ? cuentas.sinReceta : f === "archivo" ? cuentas.sinArchivo : cuentas.total;

  return (
    <motion.div className="mx-auto max-w-[1200px] space-y-6" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}>
      <div className="space-y-1">
        <h1 className="text-[28px] leading-[1.15] font-medium">Piezas</h1>
        <p className="text-sm text-muted-foreground">El archivo y la receta de cada pieza, de lo más vendido a lo menos. Sin receta el costo no se calcula.</p>
      </div>

      {!piezas ? (
        <div className="space-y-3">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      ) : (
        <>
          {/* Cuánto falta */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Piezas", cuentas.total],
              ["Sin receta", cuentas.sinReceta],
              ["Sin archivo", cuentas.sinArchivo],
              ["Completas", cuentas.completas],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border bg-card p-5">
                <p className="text-sm text-muted-foreground">{k}</p>
                <p className="mt-1 font-mono text-2xl font-medium tabular-nums">{v}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-lg border p-0.5" role="tablist" aria-label="Qué piezas ver">
              {FILTROS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={filtro === f.id}
                  onClick={() => setFiltro(f.id)}
                  className={`h-8 rounded-md px-3 text-sm transition-colors ${filtro === f.id ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {f.nombre} <span className="ml-1 font-mono text-xs tabular-nums text-muted-foreground">{cantidadDe(f.id)}</span>
                </button>
              ))}
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.5} />
              <Input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar pieza o producto" className="pl-9" />
            </div>
          </div>

          {visibles.length === 0 ? (
            <p className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              {filtro === "todas" || buscar ? "No hay piezas con eso" : "No falta nada acá"}
            </p>
          ) : (
            <div className="space-y-3">
              {visibles.map((p) => (
                <div key={p.id} className="grid gap-4 rounded-xl border bg-card p-4 md:grid-cols-[260px_minmax(0,1fr)]">
                  <div className="min-w-0 space-y-1">
                    <Link href={`/modelos/${p.modeloId}`} className="block truncate text-sm font-medium transition-colors hover:text-primary" title={p.etiqueta ?? p.nombre}>
                      {p.etiqueta ?? p.nombre}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {p.esInsumo ? "Insumo" : p.producto}
                      {" · "}
                      <span className="font-mono tabular-nums">{p.vendidas}</span> {p.esInsumo ? "usadas" : "vendidas"} en 90 días
                    </p>
                    {(!p.tieneReceta || !p.tieneArchivo) && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        Falta {[!p.tieneReceta && "la receta", !p.tieneArchivo && "el archivo"].filter(Boolean).join(" y ")}
                      </p>
                    )}
                  </div>
                  <ArchivoDePiezaBloque piezaId={p.id} info={info} onCambio={cargar} />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}
