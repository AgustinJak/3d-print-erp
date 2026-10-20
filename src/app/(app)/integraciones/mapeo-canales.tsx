"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, Search, Sprout, Store, ShoppingBag, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";

/**
 * Integraciones › Mapeo: qué combinación es cada cosa que vende cada canal
 * (docs/sdd/001, spec 004).
 *
 * La cola son las claves que llegaron (o se sembraron) y no se resolvieron
 * solas: una publicación de katana que no dice si lleva funda, un vaso que no
 * dice qué integrante. Mapear una es elegir su combinación una vez; las ventas
 * siguientes entran solas, y las líneas de pedidos abiertos que estaban
 * esperando se completan en el momento.
 */

interface CombinacionCorta {
  id: string;
  nombre: string;
  sku: string | null;
  activo: boolean;
}

interface Mapeo {
  id: string;
  canal: "mercadolibre" | "shop";
  clave: string;
  descripcion: string | null;
  unidades: number;
  ignorar: boolean;
  origen: "siembra" | "auto" | "manual";
  vecesVista: number;
  ultimaVenta: string | null;
  combinacion: CombinacionCorta | null;
  enCola: boolean;
  lineasEsperando: number;
}

interface Respuesta {
  cola: number;
  colaMl: number;
  colaShop: number;
  total: number;
  mapeos: Mapeo[];
}

type FiltroCanal = "todos" | "mercadolibre" | "shop";

const ORIGEN: Record<Mapeo["origen"], string> = {
  siembra: "Sembrado",
  auto: "Automático",
  manual: "Manual",
};

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || `error ${r.status}`);
  return data as T;
}

export function MapeoCanales({ onCambio }: { onCambio?: () => void }) {
  const [datos, setDatos] = useState<Respuesta | null>(null);
  // Qué filtros tiene lo que se ve: si no coinciden con los de ahora, está cargando.
  const [cargadoPara, setCargadoPara] = useState<string | null>(null);
  const [canal, setCanal] = useState<FiltroCanal>("todos");
  const [soloCola, setSoloCola] = useState(true);
  const [q, setQ] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [sembrando, setSembrando] = useState(false);

  // La búsqueda espera a que se deje de tipear.
  useEffect(() => {
    const t = setTimeout(() => setBusqueda(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const filtros = `${canal}|${soloCola}|${busqueda}`;
  const cargando = cargadoPara !== filtros;

  const cargar = useCallback(async () => {
    const sp = new URLSearchParams({ estado: soloCola ? "cola" : "todos" });
    if (canal !== "todos") sp.set("canal", canal);
    if (busqueda) sp.set("q", busqueda);
    try {
      setDatos(await pedir<Respuesta>(`/api/integraciones/mapeos?${sp}`));
    } catch (e) {
      toast.error(`No se pudo leer el mapeo: ${e instanceof Error ? e.message : e}`);
    } finally {
      setCargadoPara(`${canal}|${soloCola}|${busqueda}`);
    }
  }, [canal, soloCola, busqueda]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const guardar = async (m: Mapeo, cambios: { combinacionId?: string | null; unidades?: number; ignorar?: boolean }) => {
    try {
      const r = await pedir<{ lineasCompletadas: number }>(`/api/integraciones/mapeos/${m.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cambios),
      });
      toast.success(
        cambios.ignorar
          ? "Marcado como otro negocio"
          : "Mapeado" +
              (r.lineasCompletadas > 0
                ? ` · ${r.lineasCompletadas} ${r.lineasCompletadas === 1 ? "línea completada" : "líneas completadas"} y stock repartido`
                : "")
      );
      await cargar();
      onCambio?.();
    } catch (e) {
      toast.error(`No se pudo guardar: ${e instanceof Error ? e.message : e}`);
    }
  };

  const sembrarMl = async () => {
    if (!confirm("Lee cada publicación de Mercado Libre (sin modificarlas) y registra una clave por variación. Tarda uno o dos minutos. ¿Seguir?")) return;
    setSembrando(true);
    try {
      const r = await pedir<{ claves: number; mapeadas: number; enCola: number; ignoradas: number; errores: unknown[] }>(
        "/api/integraciones/mapeos/sembrar-ml",
        { method: "POST" }
      );
      toast.success(
        `${r.claves} claves: ${r.mapeadas} mapeadas, ${r.enCola} en la cola, ${r.ignoradas} de otro negocio` +
          (r.errores.length ? ` · ${r.errores.length} publicaciones no se pudieron leer` : "")
      );
      await cargar();
      onCambio?.();
    } catch (e) {
      toast.error(`No se pudo sembrar: ${e instanceof Error ? e.message : e}`);
    }
    setSembrando(false);
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1 max-w-2xl">
            <p className="text-sm font-medium">Qué es cada cosa que venden los canales</p>
            <p className="text-xs text-muted-foreground">
              Cada publicación de Mercado Libre (con su variación) y cada producto del Shop (con sus opciones) apunta a una
              combinación del catálogo. Lo que no se pudo resolver solo espera acá: elegí su combinación una vez y las ventas
              siguientes entran solas. Si es un pack, poné cuántas unidades trae.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={sembrarMl} disabled={sembrando}>
            {sembrando ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sprout className="h-3.5 w-3.5 mr-1.5" />}
            Sembrar desde Mercado Libre
          </Button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-md border overflow-hidden text-sm">
            {(
              [
                ["todos", "Todos"],
                ["mercadolibre", "Mercado Libre"],
                ["shop", "Shop"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setCanal(v)}
                className={`px-3 py-1.5 ${canal === v ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex rounded-md border overflow-hidden text-sm">
            <button
              type="button"
              onClick={() => setSoloCola(true)}
              className={`px-3 py-1.5 ${soloCola ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              En la cola{datos ? ` (${canal === "mercadolibre" ? datos.colaMl : canal === "shop" ? datos.colaShop : datos.cola})` : ""}
            </button>
            <button
              type="button"
              onClick={() => setSoloCola(false)}
              className={`px-3 py-1.5 ${!soloCola ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              Todos{datos ? ` (${datos.total})` : ""}
            </button>
          </div>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por título, clave o combinación…"
              className="h-8 pl-7 text-sm"
            />
          </div>
          {cargando && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
      </Card>

      {datos && datos.mapeos.length === 0 ? (
        <EmptyState
          icon={Check}
          title={soloCola ? "No hay nada esperando" : "Sin claves todavía"}
          description={
            soloCola
              ? "Todas las claves conocidas tienen su combinación."
              : "Las claves aparecen con cada venta, o sembrándolas desde Mercado Libre."
          }
        />
      ) : (
        <Card className="divide-y">
          {datos?.mapeos.map((m) => <FilaMapeo key={m.id} mapeo={m} onGuardar={(c) => guardar(m, c)} />)}
        </Card>
      )}
    </div>
  );
}

function FilaMapeo({
  mapeo: m,
  onGuardar,
}: {
  mapeo: Mapeo;
  onGuardar: (c: { combinacionId?: string | null; unidades?: number; ignorar?: boolean }) => Promise<void>;
}) {
  const [elegida, setElegida] = useState<CombinacionCorta | null>(m.combinacion?.activo ? m.combinacion : null);
  const [unidades, setUnidades] = useState(String(m.unidades));
  const [guardando, setGuardando] = useState(false);

  const u = Number(unidades);
  const unidadesValidas = Number.isInteger(u) && u >= 1 && u <= 1000;
  const cambio = (elegida?.id ?? null) !== (m.combinacion?.activo ? m.combinacion.id : null) || u !== m.unidades;

  const accion = async (c: Parameters<typeof onGuardar>[0]) => {
    setGuardando(true);
    await onGuardar(c);
    setGuardando(false);
  };

  return (
    <div className={`p-3 space-y-2 ${m.enCola ? "bg-amber-500/5" : ""}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            {m.canal === "mercadolibre" ? (
              <Store className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
            ) : (
              <ShoppingBag className="h-3.5 w-3.5 text-sky-500 shrink-0" />
            )}
            <p className="text-sm font-medium">{m.descripcion || m.clave}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
            <code className="font-mono">{m.clave}</code>
            <span>· {m.vecesVista === 0 ? "sin ventas todavía" : `${m.vecesVista} ${m.vecesVista === 1 ? "venta" : "ventas"}`}</span>
            {m.ultimaVenta && <span>· última {m.ultimaVenta}</span>}
            <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
              {ORIGEN[m.origen] ?? m.origen}
            </Badge>
            {m.lineasEsperando > 0 && (
              <Badge className="h-4 px-1.5 text-[10px] bg-amber-500/20 text-amber-600 border-amber-500/30 hover:bg-amber-500/20">
                {m.lineasEsperando} {m.lineasEsperando === 1 ? "línea de un pedido abierto espera" : "líneas de pedidos abiertos esperan"}
              </Badge>
            )}
          </div>
        </div>
        <div className="text-right text-xs">
          {m.ignorar ? (
            <Badge variant="outline">Otro negocio</Badge>
          ) : m.combinacion ? (
            <div className={m.combinacion.activo ? "" : "text-amber-600"}>
              <p className="font-medium">{m.combinacion.nombre}</p>
              <p className="font-mono text-muted-foreground">
                {m.combinacion.sku ?? "sin SKU"}
                {m.unidades > 1 ? ` · ×${m.unidades}` : ""}
                {m.combinacion.activo ? "" : " · desactivada"}
              </p>
            </div>
          ) : (
            <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/30 hover:bg-amber-500/20">Sin mapear</Badge>
          )}
        </div>
      </div>

      <div className="flex items-start gap-2 flex-wrap">
        <BuscarCombinacion elegida={elegida} onElegir={setElegida} />
        <label className="flex items-center gap-1 text-xs text-muted-foreground h-8">
          Unidades
          <Input
            type="number"
            min={1}
            max={1000}
            value={unidades}
            onChange={(e) => setUnidades(e.target.value)}
            className="h-8 w-16 text-sm"
            title="Cuántas unidades de la combinación trae una venta (un pack de 10 = 10)"
          />
        </label>
        <Button
          size="sm"
          className="h-8"
          disabled={guardando || !elegida || !unidadesValidas || (!cambio && !m.enCola && !m.ignorar)}
          onClick={() => elegida && accion({ combinacionId: elegida.id, unidades: u })}
        >
          {guardando ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}
          Guardar
        </Button>
        {!m.ignorar && (
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            disabled={guardando}
            onClick={() => accion({ ignorar: true })}
            title="No es de este negocio: la venta se descarta, como las publicaciones de Shay"
          >
            <XCircle className="h-3.5 w-3.5 mr-1.5" /> Otro negocio
          </Button>
        )}
      </div>
    </div>
  );
}

/** Buscador de combinaciones por nombre o SKU (cada palabra en cualquier parte). */
function BuscarCombinacion({
  elegida,
  onElegir,
}: {
  elegida: CombinacionCorta | null;
  onElegir: (c: CombinacionCorta | null) => void;
}) {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<{ texto: string; lista: CombinacionCorta[] }>({ texto: "", lista: [] });
  const [abierto, setAbierto] = useState(false);

  const texto = q.trim();
  // Sólo lo que se buscó con el texto de ahora: lo de una búsqueda vieja no se muestra.
  const buscado = texto.length >= 2 && resultados.texto === texto;
  const visibles = buscado ? resultados.lista : [];

  useEffect(() => {
    if (texto.length < 2) return;
    const t = setTimeout(async () => {
      try {
        setResultados({ texto, lista: await pedir<CombinacionCorta[]>(`/api/combinaciones?q=${encodeURIComponent(texto)}`) });
      } catch {
        setResultados({ texto, lista: [] });
      }
    }, 250);
    return () => clearTimeout(t);
  }, [texto]);

  if (elegida && !abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="flex-1 min-w-[240px] h-8 rounded-md border border-input bg-background px-2 text-left text-sm truncate hover:bg-muted"
        title="Cambiar la combinación"
      >
        {elegida.nombre}
        <span className="ml-2 font-mono text-xs text-muted-foreground">{elegida.sku ?? "sin SKU"}</span>
      </button>
    );
  }

  return (
    <div className="flex-1 min-w-[240px] space-y-1">
      <div className="flex gap-1">
        <Input
          autoFocus={abierto}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && elegida) setAbierto(false);
          }}
          placeholder="Elegí la combinación: nombre o SKU…"
          className="h-8 text-sm"
        />
        {elegida && (
          <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setAbierto(false)} title="Dejar la que estaba">
            <XCircle className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      {visibles.length > 0 && (
        <div className="max-h-56 overflow-y-auto rounded-md border bg-popover text-sm">
          {visibles.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onElegir(c);
                setAbierto(false);
                setQ("");
              }}
              className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left hover:bg-muted"
            >
              <span className="truncate">{c.nombre}</span>
              <span className="font-mono text-xs text-muted-foreground shrink-0">{c.sku ?? "sin SKU"}</span>
            </button>
          ))}
        </div>
      )}
      {buscado && visibles.length === 0 && (
        <p className="text-xs text-muted-foreground px-1">
          Nada con eso. Si la combinación no existe, creala desde el modelo (Modelos › el modelo › Combinaciones).
        </p>
      )}
    </div>
  );
}
