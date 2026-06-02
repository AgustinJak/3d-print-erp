"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Plug, ShoppingBag, RefreshCw, Copy, Check, AlertTriangle,
  CheckCircle2, XCircle, Eye, ExternalLink, Wand2, FileWarning,
  Tags, Pencil, Plus, Box, Store, Unplug, Download, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";

/* ─── Types ─────────────────────────────────────────── */

interface ShopStatus {
  secretConfigured: boolean;
  webhookUrl: string;
  totalLogs: number;
  ultimoLog: { recibidoEn: string; estado: string } | null;
  totalRevision: number;
}

interface WebhookLog {
  id: string;
  origen: string;
  evento: string;
  externoId: string | null;
  estado: "ok" | "error" | "ignorado";
  errorMsg: string | null;
  pedidoId: string | null;
  payload: unknown;
  ipAddress: string | null;
  recibidoEn: string;
}

interface PedidoRevision {
  id: string;
  externoId: string | null;
  estado: string;
  notas: string | null;
  origenExterno: { warnings?: string[] } | null;
  creadoEn: string;
  cliente: { id: string; nombre: string; email: string | null } | null;
  items: Array<{
    id: string;
    cantidad: number;
    modelo: { id: string; nombre: string; sku: string | null };
  }>;
}

interface SkusAudit {
  stats: {
    totalActivos: number;
    conSku: number;
    sinSku: number;
    consolidados: number;
    huerfanos: number;
  };
  modelosSinSku: Array<{
    id: string;
    nombre: string;
    serie: string | null;
    imagenUrl: string | null;
    categorias: Array<{ categoria: { nombre: string; color: string | null } }>;
  }>;
  orphans: Array<{
    sku: string | null;
    nombre_producto: string;
    count: number;
    ultimo_pedido: { externoId: string | null; fecha: string };
  }>;
}

interface MlStatus {
  envConfigured: boolean;
  connected: boolean;
  cuenta: {
    mlUserId: string;
    nickname: string | null;
    scope: string | null;
    expiresAt: string;
  } | null;
  webhookUrl: string;
  totalEventos: number;
  ultimoEvento: { recibidoEn: string; estado: string; evento: string } | null;
}

type Tab = "estado" | "mercadolibre" | "logs" | "revision" | "skus";

/* ─── Page ───────────────────────────────────────────── */

function IntegracionesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>("estado");
  const [status, setStatus] = useState<ShopStatus | null>(null);
  const [mlStatus, setMlStatus] = useState<MlStatus | null>(null);
  const [mlBusy, setMlBusy] = useState<null | "sync" | "disconnect">(null);
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [pedidosRevision, setPedidosRevision] = useState<PedidoRevision[]>([]);
  const [skusAudit, setSkusAudit] = useState<SkusAudit | null>(null);
  const [loading, setLoading] = useState(true);
  const [logDetail, setLogDetail] = useState<WebhookLog | null>(null);
  const [generatedSecret, setGeneratedSecret] = useState<string | null>(null);
  const [secretCopied, setSecretCopied] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [statusRes, mlRes, logsRes, revRes, skusRes] = await Promise.all([
      fetch("/api/integraciones/status"),
      fetch("/api/ml/status"),
      fetch("/api/integraciones/logs?limit=50"),
      fetch("/api/integraciones/pedidos-revision"),
      fetch("/api/integraciones/skus-audit"),
    ]);
    const statusJson = await statusRes.json();
    setStatus(statusJson.shop);
    setMlStatus(await mlRes.json());
    setLogs(await logsRes.json());
    setPedidosRevision(await revRes.json());
    setSkusAudit(await skusRes.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Resultado del callback de OAuth (?ml=ok|error&tab=mercadolibre)
  useEffect(() => {
    const ml = searchParams.get("ml");
    if (!ml) return;
    setTab("mercadolibre");
    if (ml === "ok") {
      toast.success("Cuenta de Mercado Libre conectada");
    } else {
      const detail = searchParams.get("detail");
      toast.error(`No se pudo conectar Mercado Libre${detail ? `: ${detail}` : ""}`);
    }
    // Limpiar query params de la URL
    router.replace("/integraciones");
  }, [searchParams, router]);

  const connectMl = () => {
    window.location.href = "/api/ml/oauth/start";
  };

  const disconnectMl = async () => {
    if (!confirm("¿Desconectar la cuenta de Mercado Libre? Vas a dejar de recibir pedidos automáticamente.")) return;
    setMlBusy("disconnect");
    const res = await fetch("/api/ml/disconnect", { method: "DELETE" });
    setMlBusy(null);
    if (res.ok) {
      toast.success("Cuenta desconectada");
      fetchAll();
    } else {
      toast.error("Error al desconectar");
    }
  };

  const syncMl = async () => {
    setMlBusy("sync");
    try {
      const res = await fetch("/api/ml/backfill?days=30", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Error al sincronizar");
        return;
      }
      const s = data.stats;
      toast.success(
        `Sincronización lista: ${s.creadas} nuevas, ${s.actualizadas} actualizadas, ${s.ya_existian} ya existían${s.errores ? `, ${s.errores} con error` : ""}`
      );
      fetchAll();
    } catch {
      toast.error("Error al sincronizar");
    } finally {
      setMlBusy(null);
    }
  };

  const generateSecret = async () => {
    const res = await fetch("/api/integraciones/generate-secret", { method: "POST" });
    const data = await res.json();
    setGeneratedSecret(data.secret);
    setSecretCopied(false);
  };

  const copySecret = () => {
    if (!generatedSecret) return;
    navigator.clipboard.writeText(generatedSecret);
    setSecretCopied(true);
    toast.success("Secret copiado al portapapeles");
    setTimeout(() => setSecretCopied(false), 2000);
  };

  const resolverPedido = async (id: string) => {
    const res = await fetch(`/api/integraciones/pedidos-revision/${id}/resolver`, {
      method: "POST",
    });
    if (!res.ok) {
      toast.error("Error al resolver");
      return;
    }
    toast.success("Pedido marcado como revisado");
    fetchAll();
  };

  /* ─── Render ───────────────────────────────────────── */

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Plug className="h-6 w-6" /> Integraciones
          </h1>
          <p className="text-sm text-muted-foreground">
            Conexiones con sistemas externos (e-commerce, MercadoLibre, etc.)
          </p>
        </div>
        <Button variant="outline" onClick={fetchAll} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      {/* Tabs */}
      <div className="border-b flex gap-1">
        <TabBtn active={tab === "estado"} onClick={() => setTab("estado")}>
          <ShoppingBag className="h-4 w-4 mr-1.5" /> Estado
        </TabBtn>
        <TabBtn active={tab === "mercadolibre"} onClick={() => setTab("mercadolibre")}>
          <Store className="h-4 w-4 mr-1.5" /> Mercado Libre
          {mlStatus?.connected && (
            <span className="ml-1.5 h-2 w-2 rounded-full bg-emerald-500" />
          )}
        </TabBtn>
        <TabBtn active={tab === "logs"} onClick={() => setTab("logs")}>
          <Eye className="h-4 w-4 mr-1.5" /> Logs
          {logs.length > 0 && (
            <span className="ml-1.5 text-xs text-muted-foreground">({logs.length})</span>
          )}
        </TabBtn>
        <TabBtn active={tab === "revision"} onClick={() => setTab("revision")}>
          <FileWarning className="h-4 w-4 mr-1.5" /> En revisión
          {pedidosRevision.length > 0 && (
            <Badge variant="destructive" className="ml-1.5 h-5 px-1.5">
              {pedidosRevision.length}
            </Badge>
          )}
        </TabBtn>
        <TabBtn active={tab === "skus"} onClick={() => setTab("skus")}>
          <Tags className="h-4 w-4 mr-1.5" /> Mapeo SKUs
          {skusAudit && (skusAudit.stats.sinSku > 0 || skusAudit.stats.huerfanos > 0) && (
            <Badge className="ml-1.5 h-5 px-1.5 bg-amber-500/20 text-amber-500 border-amber-500/30 hover:bg-amber-500/20">
              {skusAudit.stats.sinSku + skusAudit.stats.huerfanos}
            </Badge>
          )}
        </TabBtn>
      </div>

      {/* Tab: Estado */}
      {tab === "estado" && status && (
        <div className="space-y-4">
          <Card className="p-5 space-y-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-primary/10 p-2.5">
                  <ShoppingBag className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-semibold text-lg">Sendero Shop</h2>
                  <p className="text-sm text-muted-foreground">
                    Recibe pedidos automáticamente desde el e-commerce
                  </p>
                </div>
              </div>
              <StatusBadge configured={status.secretConfigured} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Pedidos recibidos</p>
                <p className="text-2xl font-bold">{status.totalLogs}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Pedidos en revisión</p>
                <p className="text-2xl font-bold text-amber-500">{status.totalRevision}</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">Último evento</p>
                <p className="text-sm font-medium mt-1">
                  {status.ultimoLog
                    ? new Date(status.ultimoLog.recibidoEn).toLocaleString("es-AR")
                    : "—"}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">URL del webhook</p>
              <div className="flex items-center gap-2 rounded-md border bg-muted px-3 py-2 font-mono text-xs">
                <code className="flex-1 truncate">{status.webhookUrl}</code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => {
                    const fullUrl = `${window.location.origin}${status.webhookUrl}`;
                    navigator.clipboard.writeText(fullUrl);
                    toast.success("URL copiada");
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Esta es la URL a la que el shop debe enviar los pedidos via POST.
              </p>
            </div>
          </Card>

          {/* Configuración / Generar Secret */}
          <Card className="p-5 space-y-3">
            <div className="flex items-start gap-3">
              <Wand2 className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold">Generar nuevo secret</h3>
                <p className="text-sm text-muted-foreground">
                  Si necesitás rotar la clave compartida o no tenés una todavía, generá una nueva.
                  El secret se muestra una sola vez — copialo y guardalo en un lugar seguro.
                </p>
              </div>
            </div>
            <Button onClick={generateSecret} variant="outline">
              <Wand2 className="mr-2 h-4 w-4" />
              Generar secret
            </Button>

            <div className="space-y-2 pt-2 border-t">
              <p className="text-sm font-semibold">Cómo configurarlo:</p>
              <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal pl-5">
                <li>Generá el secret con el botón de arriba</li>
                <li>
                  En <strong>Vercel del inventario</strong> agregá la env var{" "}
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">SHOP_WEBHOOK_SECRET</code>{" "}
                  con el valor generado
                </li>
                <li>
                  En <strong>Sendero Shop</strong> usá el mismo secret para firmar las requests con HMAC-SHA256
                </li>
                <li>Hacé un redeploy del inventario para que tome la variable</li>
              </ol>
            </div>
          </Card>
        </div>
      )}

      {/* Tab: Mercado Libre */}
      {tab === "mercadolibre" && mlStatus && (
        <div className="space-y-4">
          <Card className="p-5 space-y-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-[#FFE600]/20 p-2.5">
                  <Store className="h-5 w-5 text-[#2D3277]" />
                </div>
                <div>
                  <h2 className="font-semibold text-lg">Mercado Libre</h2>
                  <p className="text-sm text-muted-foreground">
                    Sincroniza automáticamente las ventas de ML con el inventario
                  </p>
                </div>
              </div>
              {mlStatus.connected ? (
                <Badge className="bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/30">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Conectado
                </Badge>
              ) : (
                <Badge className="bg-muted text-muted-foreground border-border">
                  Desconectado
                </Badge>
              )}
            </div>

            {!mlStatus.envConfigured && (
              <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-3">
                <p className="text-xs font-semibold text-amber-500 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" /> Falta configuración
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  Configurá las variables <code className="bg-muted px-1 rounded">ML_CLIENT_ID</code>,{" "}
                  <code className="bg-muted px-1 rounded">ML_CLIENT_SECRET</code> y{" "}
                  <code className="bg-muted px-1 rounded">ML_REDIRECT_URI</code> en Vercel y hacé un redeploy.
                </p>
              </div>
            )}

            {mlStatus.connected && mlStatus.cuenta ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">Cuenta</p>
                    <p className="font-medium mt-1">{mlStatus.cuenta.nickname || mlStatus.cuenta.mlUserId}</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">Eventos recibidos</p>
                    <p className="text-2xl font-bold">{mlStatus.totalEventos}</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">Último evento</p>
                    <p className="text-sm font-medium mt-1">
                      {mlStatus.ultimoEvento
                        ? new Date(mlStatus.ultimoEvento.recibidoEn).toLocaleString("es-AR")
                        : "—"}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2 flex-wrap pt-1">
                  <Button onClick={syncMl} disabled={mlBusy !== null}>
                    {mlBusy === "sync" ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sincronizando…</>
                    ) : (
                      <><Download className="mr-2 h-4 w-4" /> Sincronizar últimos 30 días</>
                    )}
                  </Button>
                  <Button variant="outline" onClick={disconnectMl} disabled={mlBusy !== null}>
                    {mlBusy === "disconnect" ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Desconectando…</>
                    ) : (
                      <><Unplug className="mr-2 h-4 w-4" /> Desconectar</>
                    )}
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Conectá tu cuenta de Mercado Libre para que los pedidos entren solos al inventario
                  y se actualice la fecha de liquidación automáticamente.
                </p>
                <Button onClick={connectMl} disabled={!mlStatus.envConfigured}>
                  <Plug className="mr-2 h-4 w-4" />
                  Conectar mi cuenta de Mercado Libre
                </Button>
              </div>
            )}

            <div className="space-y-2 pt-2 border-t">
              <p className="text-sm font-medium">URL de notificaciones</p>
              <div className="flex items-center gap-2 rounded-md border bg-muted px-3 py-2 font-mono text-xs">
                <code className="flex-1 truncate">{mlStatus.webhookUrl}</code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}${mlStatus.webhookUrl}`);
                    toast.success("URL copiada");
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Pegá esta URL (completa) en la configuración de notificaciones de tu app en el DevCenter de Mercado Libre.
              </p>
            </div>
          </Card>
        </div>
      )}

      {/* Tab: Logs */}
      {tab === "logs" && (
        <div className="space-y-2">
          {logs.length === 0 ? (
            <EmptyState
              icon={Eye}
              title="Sin logs todavía"
              description="Cuando el shop empiece a enviar pedidos van a aparecer acá."
            />
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs">
                    <tr>
                      <th className="text-left px-3 py-2.5">Estado</th>
                      <th className="text-left px-3 py-2.5">Origen</th>
                      <th className="text-left px-3 py-2.5">Evento</th>
                      <th className="text-left px-3 py-2.5">N° pedido</th>
                      <th className="text-left px-3 py-2.5">Fecha</th>
                      <th className="text-left px-3 py-2.5">Detalle</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id} className="border-t hover:bg-muted/30">
                        <td className="px-3 py-2"><EstadoIcon estado={log.estado} /></td>
                        <td className="px-3 py-2 capitalize">{log.origen}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{log.evento}</td>
                        <td className="px-3 py-2 font-mono text-xs">{log.externoId || "—"}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(log.recibidoEn).toLocaleString("es-AR")}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground max-w-xs truncate">
                          {log.errorMsg || (log.estado === "ok" ? "—" : "")}
                        </td>
                        <td className="px-3 py-2">
                          <Button variant="ghost" size="icon" onClick={() => setLogDetail(log)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Tab: Pedidos en revisión */}
      {tab === "revision" && (
        <div className="space-y-3">
          {pedidosRevision.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="Todo en orden"
              description="No hay pedidos del shop esperando revisión manual."
            />
          ) : (
            pedidosRevision.map((p) => (
              <Card key={p.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2">
                      <code className="font-mono text-sm font-semibold">
                        {p.externoId || p.id.slice(0, 8)}
                      </code>
                      <Badge variant="outline" className="border-amber-500 text-amber-500">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Revisión manual
                      </Badge>
                    </div>
                    <p className="text-sm font-medium mt-1">
                      {p.cliente?.nombre || "Cliente sin nombre"}
                    </p>
                    {p.cliente?.email && (
                      <p className="text-xs text-muted-foreground">{p.cliente.email}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(p.creadoEn).toLocaleString("es-AR")}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.push(`/pedidos?id=${p.id}`)}
                    >
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                      Ver pedido
                    </Button>
                    <Button size="sm" onClick={() => resolverPedido(p.id)}>
                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                      Marcar revisado
                    </Button>
                  </div>
                </div>

                {p.origenExterno?.warnings && p.origenExterno.warnings.length > 0 && (
                  <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-3 space-y-1">
                    <p className="text-xs font-semibold text-amber-500">⚠️ Warnings</p>
                    {p.origenExterno.warnings.map((w, idx) => (
                      <p key={idx} className="text-xs text-amber-600 dark:text-amber-400">• {w}</p>
                    ))}
                  </div>
                )}

                <div className="rounded-md border p-2.5 text-xs space-y-1">
                  <p className="font-semibold text-muted-foreground mb-1">Items:</p>
                  {p.items.map((it) => (
                    <div key={it.id} className="flex justify-between">
                      <span>
                        {it.cantidad}x {it.modelo.nombre}
                        {it.modelo.sku && (
                          <span className="text-muted-foreground ml-1">({it.modelo.sku})</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Tab: Mapeo SKUs */}
      {tab === "skus" && skusAudit && (
        <div className="space-y-4">
          {/* Stats cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              icon={Tags}
              label="Con SKU"
              value={skusAudit.stats.conSku}
              total={skusAudit.stats.totalActivos}
              color="emerald"
            />
            <StatCard
              icon={AlertTriangle}
              label="Sin SKU"
              value={skusAudit.stats.sinSku}
              total={skusAudit.stats.totalActivos}
              color="amber"
            />
            <StatCard
              icon={Box}
              label="Consolidados"
              value={skusAudit.stats.consolidados}
              color="muted"
            />
            <StatCard
              icon={FileWarning}
              label="SKUs huérfanos"
              value={skusAudit.stats.huerfanos}
              color={skusAudit.stats.huerfanos > 0 ? "red" : "muted"}
            />
          </div>

          {/* Modelos sin SKU */}
          <Card className="overflow-hidden">
            <div className="p-4 border-b">
              <h2 className="font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Modelos sin SKU
                <span className="text-xs text-muted-foreground font-normal">
                  ({skusAudit.modelosSinSku.length})
                </span>
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Modelos activos del catálogo que todavía no tienen SKU asignado.
                Cargá el SKU correspondiente del shop para que el webhook los matchee automáticamente.
              </p>
            </div>
            {skusAudit.modelosSinSku.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500" />
                Todos los modelos activos tienen SKU asignado.
              </div>
            ) : (
              <div className="divide-y">
                {skusAudit.modelosSinSku.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-3 p-3 hover:bg-muted/30 transition-colors"
                  >
                    <div className="h-10 w-10 rounded bg-muted shrink-0 overflow-hidden flex items-center justify-center">
                      {m.imagenUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.imagenUrl} alt={m.nombre} className="h-full w-full object-cover" />
                      ) : (
                        <Box className="h-5 w-5 text-muted-foreground/40" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{m.nombre}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        {m.serie && (
                          <span className="text-xs text-muted-foreground">{m.serie}</span>
                        )}
                        {m.categorias.slice(0, 2).map(({ categoria }, i) => (
                          <span
                            key={i}
                            className="text-[10px] px-1.5 py-0.5 rounded"
                            style={
                              categoria.color
                                ? { backgroundColor: categoria.color, color: "#fff" }
                                : { backgroundColor: "var(--muted)" }
                            }
                          >
                            {categoria.nombre}
                          </span>
                        ))}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.push(`/modelos?edit=${m.id}`)}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1.5" />
                      Cargar SKU
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* SKUs huérfanos */}
          <Card className="overflow-hidden">
            <div className="p-4 border-b">
              <h2 className="font-semibold flex items-center gap-2">
                <FileWarning className="h-4 w-4 text-red-500" />
                SKUs huérfanos
                <span className="text-xs text-muted-foreground font-normal">
                  ({skusAudit.orphans.length})
                </span>
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Productos que aparecieron en pedidos del shop pero NO existen en el inventario.
                Probablemente sean modelos que falta crear, o que tienen otro SKU asignado por error.
              </p>
            </div>
            {skusAudit.orphans.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500" />
                Todos los productos del shop matchean con modelos del inventario.
              </div>
            ) : (
              <div className="divide-y">
                {skusAudit.orphans.map((o, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-3 p-3 hover:bg-muted/30 transition-colors"
                  >
                    <div className="h-10 w-10 rounded bg-red-500/10 border border-red-500/20 shrink-0 flex items-center justify-center">
                      <FileWarning className="h-4 w-4 text-red-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{o.nombre_producto}</p>
                      <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                        {o.sku && (
                          <code className="font-mono bg-muted px-1.5 py-0.5 rounded text-[10px]">
                            {o.sku}
                          </code>
                        )}
                        <span>{o.count} {o.count === 1 ? "vez" : "veces"}</span>
                        {o.ultimo_pedido.externoId && (
                          <span>· último: {o.ultimo_pedido.externoId}</span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        // Pre-cargar SKU + nombre en URL hash para autocompletar el form
                        const params = new URLSearchParams();
                        params.set("nuevo", "1");
                        params.set("nombre", o.nombre_producto);
                        if (o.sku) params.set("sku", o.sku);
                        router.push(`/modelos?${params.toString()}`);
                      }}
                      title="Crear modelo nuevo con este SKU"
                    >
                      <Plus className="h-3.5 w-3.5 mr-1.5" />
                      Crear modelo
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Modal: Generated secret */}
      <Dialog open={!!generatedSecret} onOpenChange={(o) => !o && setGeneratedSecret(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo secret generado</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-3">
              <p className="text-xs font-semibold text-amber-500">⚠️ Importante</p>
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                Este secret se muestra una sola vez. Copialo ahora y guardalo en Vercel + en el shop.
              </p>
            </div>

            <div className="rounded-md border bg-muted p-3">
              <code className="break-all text-xs font-mono select-all">{generatedSecret}</code>
            </div>

            <Button onClick={copySecret} className="w-full" variant={secretCopied ? "default" : "outline"}>
              {secretCopied ? (
                <><Check className="mr-2 h-4 w-4" /> Copiado</>
              ) : (
                <><Copy className="mr-2 h-4 w-4" /> Copiar al portapapeles</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: Log detail */}
      <Dialog open={!!logDetail} onOpenChange={(o) => !o && setLogDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle del log</DialogTitle>
          </DialogHeader>
          {logDetail && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Estado"><EstadoIcon estado={logDetail.estado} /></Field>
                <Field label="Origen">{logDetail.origen}</Field>
                <Field label="Evento">{logDetail.evento}</Field>
                <Field label="N° pedido">{logDetail.externoId || "—"}</Field>
                <Field label="IP">{logDetail.ipAddress || "—"}</Field>
                <Field label="Fecha">
                  {new Date(logDetail.recibidoEn).toLocaleString("es-AR")}
                </Field>
              </div>
              {logDetail.errorMsg && (
                <div className="rounded-md bg-red-500/10 border border-red-500/30 p-3">
                  <p className="text-xs font-semibold text-red-500">Error</p>
                  <p className="text-xs text-red-400 mt-1">{logDetail.errorMsg}</p>
                </div>
              )}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">Payload</p>
                <pre className="text-[10px] bg-muted rounded-md p-3 overflow-x-auto">
                  {JSON.stringify(logDetail.payload, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function IntegracionesPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Cargando…</div>}>
      <IntegracionesContent />
    </Suspense>
  );
}

/* ─── Subcomponents ───────────────────────────────────── */

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center px-3 py-2 text-sm border-b-2 transition-colors -mb-px ${
        active
          ? "border-primary text-primary font-medium"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function StatusBadge({ configured }: { configured: boolean }) {
  if (configured) {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/30">
        <CheckCircle2 className="h-3 w-3 mr-1" /> Configurado
      </Badge>
    );
  }
  return (
    <Badge className="bg-amber-500/15 text-amber-500 hover:bg-amber-500/20 border-amber-500/30">
      <AlertTriangle className="h-3 w-3 mr-1" /> Falta SHOP_WEBHOOK_SECRET
    </Badge>
  );
}

function EstadoIcon({ estado }: { estado: string }) {
  if (estado === "ok") {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/30">
        <CheckCircle2 className="h-3 w-3 mr-1" /> OK
      </Badge>
    );
  }
  if (estado === "ignorado") {
    return (
      <Badge className="bg-blue-500/15 text-blue-500 hover:bg-blue-500/20 border-blue-500/30">
        Ignorado
      </Badge>
    );
  }
  return (
    <Badge className="bg-red-500/15 text-red-500 hover:bg-red-500/20 border-red-500/30">
      <XCircle className="h-3 w-3 mr-1" /> Error
    </Badge>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  total,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  total?: number;
  color: "emerald" | "amber" | "red" | "muted";
}) {
  const colorClasses = {
    emerald: "bg-emerald-500/10 border-emerald-500/30 text-emerald-500",
    amber: "bg-amber-500/10 border-amber-500/30 text-amber-500",
    red: "bg-red-500/10 border-red-500/30 text-red-500",
    muted: "bg-muted/40 border-border text-muted-foreground",
  };
  return (
    <Card className={`p-3 border ${colorClasses[color]}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium">{label}</span>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-bold text-foreground">{value}</span>
        {total !== undefined && (
          <span className="text-xs text-muted-foreground">/ {total}</span>
        )}
      </div>
    </Card>
  );
}
