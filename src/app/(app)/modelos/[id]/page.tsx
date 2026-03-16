"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, FileBox, Download, Package, Tag, Pencil,
  DollarSign, Wrench, Percent, Star, Zap, ChevronLeft, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TableSkeleton } from "@/components/data-loading";

interface Variante {
  id: string;
  nombre: string;
  precioAdicional: number;
  costoFabAdicional: number;
  notas: string | null;
}

interface Modelo {
  id: string;
  nombre: string;
  serie: string | null;
  pesoGr: number | null;
  costoFab: number;
  precioVenta: number;
  precioCreditoPorc: number;
  precioMayorista: number | null;
  precioPromo: number | null;
  notas: string | null;
  archivo3mfUrl: string | null;
  imagenUrl: string | null;
  imagenesUrls: string[];
  activo: boolean;
  creadoEn: string;
  categorias: Array<{ categoria: { id: string; nombre: string; color: string | null } }>;
  variantes: Variante[];
}

function formatMoney(n: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function ModeloDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [modelo, setModelo] = useState<Modelo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [imgIdx, setImgIdx] = useState(0);

  useEffect(() => {
    fetch(`/api/modelos/${id}`)
      .then((r) => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.json();
      })
      .then((data) => {
        if (data) setModelo(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  if (loading) return <TableSkeleton cols={3} />;
  if (notFound || !modelo) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Package className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">Modelo no encontrado</p>
        <Button variant="outline" onClick={() => router.push("/modelos")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Volver a modelos
        </Button>
      </div>
    );
  }

  // Build image list: imagenUrl + imagenesUrls combined, deduplicated
  const allImages = [
    ...(modelo.imagenUrl ? [modelo.imagenUrl] : []),
    ...modelo.imagenesUrls.filter((u) => u !== modelo.imagenUrl),
  ];

  const precioCredito = modelo.precioVenta * (1 + modelo.precioCreditoPorc / 100);
  const margen = modelo.precioVenta > 0
    ? (((modelo.precioVenta - modelo.costoFab) / modelo.precioVenta) * 100).toFixed(0)
    : "0";

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/modelos")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold">{modelo.nombre}</h1>
              {!modelo.activo && (
                <Badge variant="secondary" className="text-xs">Inactivo</Badge>
              )}
            </div>
            {modelo.serie && (
              <p className="text-sm text-muted-foreground mt-0.5">Serie: {modelo.serie}</p>
            )}
            <div className="flex flex-wrap gap-1 mt-2">
              {modelo.categorias.map(({ categoria }) => (
                <Badge
                  key={categoria.id}
                  variant="secondary"
                  className="text-xs"
                  style={categoria.color ? { backgroundColor: categoria.color, color: "#fff" } : undefined}
                >
                  <Tag className="h-3 w-3 mr-1" />
                  {categoria.nombre}
                </Badge>
              ))}
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => router.push("/modelos")}>
          <Pencil className="h-3.5 w-3.5 mr-1.5" />
          Editar
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Gallery */}
        <div className="space-y-3">
          {allImages.length > 0 ? (
            <>
              {/* Main image */}
              <div className="relative aspect-square rounded-xl overflow-hidden bg-muted border">
                <img
                  src={allImages[imgIdx]}
                  alt={modelo.nombre}
                  className="w-full h-full object-contain"
                />
                {allImages.length > 1 && (
                  <>
                    <button
                      className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-background/80 border flex items-center justify-center hover:bg-background transition-colors"
                      onClick={() => setImgIdx((imgIdx - 1 + allImages.length) % allImages.length)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-background/80 border flex items-center justify-center hover:bg-background transition-colors"
                      onClick={() => setImgIdx((imgIdx + 1) % allImages.length)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                      {allImages.map((_, i) => (
                        <button
                          key={i}
                          onClick={() => setImgIdx(i)}
                          className={`h-1.5 rounded-full transition-all ${
                            i === imgIdx ? "w-4 bg-primary" : "w-1.5 bg-primary/30"
                          }`}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
              {/* Thumbnails */}
              {allImages.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {allImages.map((url, i) => (
                    <button
                      key={i}
                      onClick={() => setImgIdx(i)}
                      className={`shrink-0 h-16 w-16 rounded-lg overflow-hidden border-2 transition-colors ${
                        i === imgIdx ? "border-primary" : "border-transparent"
                      }`}
                    >
                      <img src={url} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="aspect-square rounded-xl bg-muted border flex flex-col items-center justify-center gap-3">
              <Package className="h-16 w-16 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Sin imágenes</p>
            </div>
          )}

          {/* 3MF download */}
          {modelo.archivo3mfUrl && (
            <a
              href={modelo.archivo3mfUrl}
              download
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" className="w-full gap-2">
                <FileBox className="h-4 w-4 text-violet-500" />
                Descargar archivo .3MF
                <Download className="h-3.5 w-3.5 ml-auto text-muted-foreground" />
              </Button>
            </a>
          )}
        </div>

        {/* Right: Info */}
        <div className="space-y-4">
          {/* Pricing card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <DollarSign className="h-4 w-4" /> Precios
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Precio venta</span>
                <span className="text-xl font-bold">{formatMoney(modelo.precioVenta)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <Wrench className="h-3.5 w-3.5" /> Costo fabricación
                </span>
                <span className="font-medium">{formatMoney(modelo.costoFab)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <Percent className="h-3.5 w-3.5" /> Margen
                </span>
                <Badge variant={Number(margen) >= 40 ? "default" : "secondary"}>
                  {margen}%
                </Badge>
              </div>
              <div className="border-t pt-3 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Percent className="h-3.5 w-3.5" /> Crédito (+{modelo.precioCreditoPorc}%)
                  </span>
                  <span>{formatMoney(precioCredito)}</span>
                </div>
                {modelo.precioMayorista && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Star className="h-3.5 w-3.5" /> Mayorista
                    </span>
                    <span>{formatMoney(modelo.precioMayorista)}</span>
                  </div>
                )}
                {modelo.precioPromo && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Zap className="h-3.5 w-3.5" /> Promo
                    </span>
                    <span className="text-orange-500 font-medium">{formatMoney(modelo.precioPromo)}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Details */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Package className="h-4 w-4" /> Detalles
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {modelo.pesoGr && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Peso</span>
                  <span>{modelo.pesoGr}g</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Creado</span>
                <span>{new Date(modelo.creadoEn).toLocaleDateString("es-AR")}</span>
              </div>
              {modelo.notas && (
                <div className="pt-2 border-t">
                  <p className="text-muted-foreground text-xs mb-1">Notas</p>
                  <p className="text-sm">{modelo.notas}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Variants */}
          {modelo.variantes.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Variantes ({modelo.variantes.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {modelo.variantes.map((v) => (
                  <div key={v.id} className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">{v.nombre}</p>
                      {v.notas && <p className="text-xs text-muted-foreground">{v.notas}</p>}
                    </div>
                    <div className="text-right text-xs space-y-0.5">
                      {v.precioAdicional > 0 && (
                        <p className="text-green-600">+{formatMoney(v.precioAdicional)} venta</p>
                      )}
                      {v.costoFabAdicional > 0 && (
                        <p className="text-muted-foreground">+{formatMoney(v.costoFabAdicional)} costo</p>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
