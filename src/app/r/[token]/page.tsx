"use client";

import { use, useCallback, useEffect, useState } from "react";
import { Check, Loader2, MapPin, Phone, RotateCcw, X, Zap } from "lucide-react";
import type { EnvioDelRepartidor, HojaDelRepartidor } from "@/lib/reparto";

/**
 * La hoja del repartidor (docs/sdd/018): la abre desde el link de WhatsApp, sin usuario, en el
 * celular. Móvil primero: una columna, botones grandes para el pulgar, texto de 16 px. Lo que marca se
 * guarda al toque y, si no hay señal, se reintenta.
 */

const ZONA = "America/Argentina/Buenos_Aires";
const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;
const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-AR", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", hour12: false });
const conHora = (iso: string | null) => !!iso && !/T(00|12):00:00(\.000)?Z$/.test(iso);

type Estado = EnvioDelRepartidor["estado"];

export default function HojaRepartidor({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [h, setH] = useState<HojaDelRepartidor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(() => {
    fetch(`/api/r/${token}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "No se pudo abrir la hoja");
        setH(j as HojaDelRepartidor);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [token]);

  useEffect(() => {
    cargar();
    // Si vuelve a la pestaña (o al celular), trae lo último: los cambios de la hoja se ven sin otro link.
    const alVolver = () => document.visibilityState === "visible" && cargar();
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, [cargar]);

  async function marcar(e: EnvioDelRepartidor, estado: Estado, motivo?: string) {
    const antes = h;
    // Al toque en pantalla; si falla, vuelve atrás y avisa.
    setH((x) => (x ? { ...x, envios: x.envios.map((y) => (y.id === e.id ? { ...y, estado, motivo: motivo ?? null } : y)) } : x));
    setGuardando(e.id);
    for (let intento = 0; intento < 3; intento++) {
      try {
        const r = await fetch(`/api/r/${token}/${e.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ estado, motivo }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw Object.assign(new Error(j.error ?? "No se pudo guardar"), { definitivo: r.status < 500 });
        setGuardando(null);
        if (estado === "entregado") cargar(); // actualiza lo de la semana
        return;
      } catch (err) {
        if ((err as { definitivo?: boolean }).definitivo || intento === 2) {
          setH(antes);
          setGuardando(null);
          setAviso(err instanceof Error ? err.message : "No se pudo guardar. Fijate la señal y probá de nuevo.");
          setTimeout(() => setAviso(null), 5000);
          return;
        }
        await new Promise((res) => setTimeout(res, 1500 * (intento + 1)));
      }
    }
  }

  if (error)
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <p className="text-lg font-medium">{error}</p>
        <button onClick={cargar} className="h-12 rounded-xl border px-5 text-base">
          Probar de nuevo
        </button>
      </main>
    );

  if (!h)
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </main>
    );

  const dia = new Date(`${h.dia}T12:00:00Z`).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "numeric", timeZone: "UTC" });
  const llevo = h.envios.filter((e) => e.estado === "tomado" || e.estado === "entregado" || e.estado === "no_entregado");
  const entregados = h.envios.filter((e) => e.estado === "entregado");
  const sinResponder = h.envios.filter((e) => e.estado === "ofrecido").length;

  return (
    <main className="mx-auto min-h-dvh max-w-md bg-background pb-10 text-base">
      <header className="sticky top-0 z-10 border-b bg-background/95 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 backdrop-blur">
        <h1 className="text-xl font-medium first-letter:uppercase">Envíos del {dia}</h1>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <Dato n={sinResponder} texto="sin responder" acento={sinResponder > 0} />
          <Dato n={llevo.length} texto="llevás" />
          <Dato n={entregados.length} texto="entregados" />
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Esta semana: <span className="font-mono text-foreground tabular-nums">{pesos(h.semana.total)}</span> por {h.semana.entregados}{" "}
          {h.semana.entregados === 1 ? "envío entregado" : "envíos entregados"}. Se cobra el lunes.
        </p>
      </header>

      {aviso && <p className="mx-4 mt-3 rounded-xl bg-amber-500/15 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">{aviso}</p>}

      {!h.envios.length ? (
        <p className="px-4 py-10 text-center text-muted-foreground">Hoy no hay envíos para vos.</p>
      ) : (
        <ul className="space-y-3 px-4 pt-4">
          {h.envios.map((e) => (
            <Tarjeta key={e.id} e={e} guardando={guardando === e.id} onMarcar={(estado, motivo) => marcar(e, estado, motivo)} />
          ))}
        </ul>
      )}

      <p className="px-4 pt-6 text-center text-xs text-muted-foreground">
        Este link vence el {new Date(h.vence).toLocaleDateString("es-AR", { timeZone: ZONA, day: "numeric", month: "numeric" })} a las {hora(h.vence)}. Los datos son sólo para entregar.
      </p>
    </main>
  );
}

function Dato({ n, texto, acento }: { n: number; texto: string; acento?: boolean }) {
  return (
    <div className="rounded-xl bg-muted/60 py-2">
      <div className={`font-mono text-xl tabular-nums ${acento ? "text-primary" : ""}`}>{n}</div>
      <div className="text-xs text-muted-foreground">{texto}</div>
    </div>
  );
}

function Tarjeta({ e, guardando, onMarcar }: { e: EnvioDelRepartidor; guardando: boolean; onMarcar: (estado: Estado, motivo?: string) => void }) {
  const apagada = e.estado === "rechazado";
  return (
    <li className={`overflow-hidden rounded-2xl border bg-card transition-opacity ${apagada ? "opacity-60" : ""}`}>
      <div className="space-y-2 p-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="rounded-md bg-muted px-2 py-0.5">{e.zona ?? "Sin zona"}</span>
          {e.precio != null && <span className="font-mono tabular-nums">{pesos(e.precio)}</span>}
          {e.origen === "flex" && (
            <span className="ml-auto flex items-center gap-1 font-medium text-primary">
              <Zap className="h-4 w-4" strokeWidth={2} />
              Flex{conHora(e.hasta) ? ` · hasta ${hora(e.hasta!)}` : ""}
            </span>
          )}
          {e.origen === "web" && <span className="ml-auto text-muted-foreground">Mensajería</span>}
        </div>
        <div>
          {e.nombre && <p className="text-lg leading-snug font-medium">{e.nombre}</p>}
          {(e.direccion || e.localidad) && (
            <p className="leading-snug">
              {e.direccion}
              {e.direccion && e.localidad && " "}
              {e.localidad && <span className="font-medium">{e.localidad}</span>}
            </p>
          )}
          {e.detalle && <p className="text-sm text-muted-foreground">{e.detalle}</p>}
        </div>
        {(e.mapa || e.telefono) && (
          <div className="flex gap-2 pt-1">
            {e.mapa && (
              <a href={e.mapa} target="_blank" rel="noopener noreferrer" className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border text-sm">
                <MapPin className="h-4 w-4" strokeWidth={1.75} /> Abrir en Maps
              </a>
            )}
            {e.telefono && (
              <a href={`tel:${e.telefono.replace(/[^\d+]/g, "")}`} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border text-sm">
                <Phone className="h-4 w-4" strokeWidth={1.75} /> Llamar
              </a>
            )}
          </div>
        )}
      </div>

      <div className="border-t bg-muted/30 p-3">
        {e.estado === "ofrecido" && (
          <div className="grid grid-cols-2 gap-2">
            <Boton onClick={() => onMarcar("rechazado")} disabled={guardando} variante="borde">
              <X className="h-5 w-5" strokeWidth={2} /> No lo llevo
            </Boton>
            <Boton onClick={() => onMarcar("tomado")} disabled={guardando} variante="principal">
              <Check className="h-5 w-5" strokeWidth={2} /> Lo llevo
            </Boton>
          </div>
        )}
        {e.estado === "tomado" && (
          <div className="grid grid-cols-2 gap-2">
            <Boton
              onClick={() => {
                const m = prompt("¿Qué pasó? (opcional)") ?? undefined;
                onMarcar("no_entregado", m);
              }}
              disabled={guardando}
              variante="borde"
            >
              No se pudo
            </Boton>
            <Boton onClick={() => onMarcar("entregado")} disabled={guardando} variante="principal">
              <Check className="h-5 w-5" strokeWidth={2} /> Entregado
            </Boton>
          </div>
        )}
        {(e.estado === "entregado" || e.estado === "rechazado" || e.estado === "no_entregado") && (
          <div className="flex items-center justify-between gap-3 px-1">
            <span className={`text-base ${e.estado === "entregado" ? "font-medium text-primary" : "text-muted-foreground"}`}>
              {e.estado === "entregado" ? "Entregado" : e.estado === "rechazado" ? "No lo llevás" : `No se pudo${e.motivo ? `: ${e.motivo}` : ""}`}
            </span>
            <button
              onClick={() => onMarcar(e.estado === "rechazado" ? "ofrecido" : "tomado")}
              disabled={guardando}
              className="flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm text-muted-foreground"
            >
              <RotateCcw className="h-4 w-4" strokeWidth={1.75} /> Cambiar
            </button>
          </div>
        )}
        {guardando && <p className="pt-2 text-center text-xs text-muted-foreground">Guardando…</p>}
      </div>
    </li>
  );
}

function Boton({ children, onClick, disabled, variante }: { children: React.ReactNode; onClick: () => void; disabled: boolean; variante: "principal" | "borde" }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex h-12 items-center justify-center gap-2 rounded-xl text-base font-medium transition-transform active:scale-[0.98] disabled:opacity-50 ${
        variante === "principal" ? "bg-primary text-primary-foreground" : "border bg-background"
      }`}
    >
      {children}
    </button>
  );
}
