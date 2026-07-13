"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  Home, ArrowLeft, ArrowRight, Plus, Trash2, Pencil, PiggyBank, Settings2, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/* ─── Constantes ─── */
const PERSONAS: Record<string, string> = { tai: "Tai", sendero: "Sendero" };
const GRUPOS = [
  { id: "fijo", label: "Fijos" },
  { id: "ocio", label: "Ocio" },
  { id: "inversion", label: "Inversión casa" },
] as const;
const REPARTOS = [
  { id: "proporcional", label: "Proporcional al ingreso" },
  { id: "mitad", label: "Mitad y mitad" },
  { id: "personal", label: "Lo paga uno solo" },
];
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const fmt = (n: number) => `$${Math.round(n || 0).toLocaleString("es-AR")}`;

/* ─── Types ─── */
interface GastoItem {
  id: string;
  nombre: string;
  monto: number;
  reparto: string;
  personaPaga: string | null;
  parteTai: number;
  parteSendero: number;
  fijoId: string | null;
}
interface Fijo {
  id: string;
  nombre: string;
  monto: number;
  reparto: string;
  personaPaga: string | null;
  activo: boolean;
}
interface CasaData {
  mes: number;
  anio: number;
  ingresos: { tai: number; sendero: number; total: number; propTai: number; propSendero: number };
  gastos: { fijo: GastoItem[]; ocio: GastoItem[]; inversion: GastoItem[] };
  totales: {
    gastoTotal: number; gastoFijo: number; gastoOcio: number; gastoInversion: number;
    tocaTai: number; tocaSendero: number;
    ahorroTai: number; ahorroSendero: number; ahorroTotal: number;
  };
  plantillaFijos: Fijo[];
  fijosPendientes: number;
}

export default function CasaPage() {
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [anio, setAnio] = useState(now.getFullYear());
  const [data, setData] = useState<CasaData | null>(null);
  const [loading, setLoading] = useState(true);

  // inputs de ingreso (controlados localmente)
  const [ingTai, setIngTai] = useState("");
  const [ingSendero, setIngSendero] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/casa?mes=${mes}&anio=${anio}`);
    const d: CasaData = await res.json();
    setData(d);
    setIngTai(d.ingresos.tai ? String(d.ingresos.tai) : "");
    setIngSendero(d.ingresos.sendero ? String(d.ingresos.sendero) : "");
    setLoading(false);
  }, [mes, anio]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const prevMonth = () => { if (mes === 1) { setMes(12); setAnio(anio - 1); } else setMes(mes - 1); };
  const nextMonth = () => { if (mes === 12) { setMes(1); setAnio(anio + 1); } else setMes(mes + 1); };

  const guardarIngreso = async (persona: string, valor: string) => {
    await fetch("/api/casa/ingresos", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ persona, monto: valor || 0, mes, anio }),
    });
    fetchData();
  };

  const cargarFijos = async () => {
    const res = await fetch("/api/casa/cargar-fijos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mes, anio }),
    });
    const d = await res.json();
    toast.success(`${d.cargados} gasto(s) fijo(s) cargado(s)`);
    fetchData();
  };

  const eliminarGasto = async (id: string) => {
    await fetch(`/api/casa/gastos?id=${id}`, { method: "DELETE" });
    fetchData();
  };

  /* Dialogs */
  const [gastoDialog, setGastoDialog] = useState(false);
  const [gastoEdit, setGastoEdit] = useState<GastoItem | null>(null);
  const [gastoForm, setGastoForm] = useState({ grupo: "ocio", nombre: "", monto: "", reparto: "proporcional", personaPaga: "sendero" });
  const [fijosDialog, setFijosDialog] = useState(false);

  const openGasto = (grupo: string, edit?: GastoItem) => {
    if (edit) {
      setGastoEdit(edit);
      setGastoForm({ grupo, nombre: edit.nombre, monto: String(edit.monto), reparto: edit.reparto, personaPaga: edit.personaPaga || "sendero" });
    } else {
      setGastoEdit(null);
      setGastoForm({ grupo, nombre: "", monto: "", reparto: "proporcional", personaPaga: "sendero" });
    }
    setGastoDialog(true);
  };

  const submitGasto = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ...gastoForm, mes, anio, ...(gastoEdit ? { id: gastoEdit.id } : {}) };
    const res = await fetch("/api/casa/gastos", {
      method: gastoEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) { toast.error("Error al guardar"); return; }
    toast.success(gastoEdit ? "Gasto actualizado" : "Gasto agregado");
    setGastoDialog(false);
    fetchData();
  };

  if (loading && !data) {
    return <div className="p-6 text-sm text-muted-foreground">Cargando…</div>;
  }
  if (!data) return null;

  const t = data.totales;

  // Total e ingresos en vivo (reactivos a los inputs, sin esperar el guardado)
  const nTai = parseFloat(ingTai) || 0;
  const nSendero = parseFloat(ingSendero) || 0;
  const totalLocal = nTai + nSendero;
  const propTaiLocal = totalLocal > 0 ? nTai / totalLocal : 0;
  const propSenderoLocal = totalLocal > 0 ? nSendero / totalLocal : 0;

  return (
    <div className="space-y-4">
      {/* Header + mes */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Home className="h-6 w-6" /> Casa
        </h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setFijosDialog(true)}>
            <Settings2 className="h-4 w-4 mr-1.5" /> Gastos fijos
          </Button>
          <div className="flex items-center border rounded-md">
            <Button variant="ghost" size="icon" onClick={prevMonth}><ArrowLeft className="h-4 w-4" /></Button>
            <span className="text-sm font-medium px-2 min-w-[130px] text-center">{MESES[mes - 1]} {anio}</span>
            <Button variant="ghost" size="icon" onClick={nextMonth}><ArrowRight className="h-4 w-4" /></Button>
          </div>
        </div>
      </div>

      {/* Ingresos */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <h2 className="text-sm font-semibold mb-3 text-muted-foreground">Ingresos del mes</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">{PERSONAS.tai}</Label>
              <Input type="number" value={ingTai} onChange={(e) => setIngTai(e.target.value)}
                onBlur={() => guardarIngreso("tai", ingTai)} placeholder="0" />
              {totalLocal > 0 && (
                <p className="text-[11px] text-muted-foreground">{Math.round(propTaiLocal * 100)}% del total</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{PERSONAS.sendero}</Label>
              <Input type="number" value={ingSendero} onChange={(e) => setIngSendero(e.target.value)}
                onBlur={() => guardarIngreso("sendero", ingSendero)} placeholder="0" />
              {totalLocal > 0 && (
                <p className="text-[11px] text-muted-foreground">{Math.round(propSenderoLocal * 100)}% del total</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Total</Label>
              <p className="text-2xl font-bold">{fmt(totalLocal)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resumen: le toca / ahorro */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-2">
              <PiggyBank className="h-4 w-4 text-emerald-500" />
              <h3 className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">Ahorro del mes</h3>
            </div>
            <p className="text-2xl font-bold text-emerald-600">{fmt(t.ahorroTotal)}</p>
            <p className="text-xs text-muted-foreground">Ingresos − gastos totales ({fmt(t.gastoTotal)})</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <h3 className="text-sm font-semibold mb-2">{PERSONAS.tai}</h3>
            <div className="text-xs space-y-0.5">
              <div className="flex justify-between"><span className="text-muted-foreground">Le toca pagar</span><span className="font-medium">{fmt(t.tocaTai)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Ahorra</span><span className={`font-semibold ${t.ahorroTai >= 0 ? "text-emerald-600" : "text-red-600"}`}>{fmt(t.ahorroTai)}</span></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <h3 className="text-sm font-semibold mb-2">{PERSONAS.sendero}</h3>
            <div className="text-xs space-y-0.5">
              <div className="flex justify-between"><span className="text-muted-foreground">Le toca pagar</span><span className="font-medium">{fmt(t.tocaSendero)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Ahorra</span><span className={`font-semibold ${t.ahorroSendero >= 0 ? "text-emerald-600" : "text-red-600"}`}>{fmt(t.ahorroSendero)}</span></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Aviso cargar fijos */}
      {data.fijosPendientes > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-3 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Tenés {data.fijosPendientes} gasto(s) fijo(s) de la plantilla sin cargar este mes.
            </p>
            <Button size="sm" onClick={cargarFijos}>
              <Download className="h-4 w-4 mr-1.5" /> Cargar fijos del mes
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Gastos por grupo */}
      {GRUPOS.map((g) => {
        const items = data.gastos[g.id as keyof CasaData["gastos"]];
        const totalG = items.reduce((s, i) => s + i.monto, 0);
        return (
          <Card key={g.id} className="overflow-hidden">
            <div className="p-3 border-b flex items-center justify-between">
              <h2 className="font-semibold flex items-center gap-2">
                {g.label}
                <span className="text-xs text-muted-foreground font-normal">{fmt(totalG)}</span>
              </h2>
              <Button size="sm" variant="outline" onClick={() => openGasto(g.id)}>
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Agregar
              </Button>
            </div>
            {items.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">Sin gastos en este grupo.</p>
            ) : (
              <div className="divide-y">
                {items.map((it) => (
                  <div key={it.id} className="p-3 flex items-center gap-3 hover:bg-muted/20">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{it.nombre}</span>
                        <Badge variant="secondary" className="text-[10px]">
                          {it.reparto === "personal" ? `Paga ${PERSONAS[it.personaPaga || ""]}` :
                            it.reparto === "mitad" ? "50/50" : "Proporcional"}
                        </Badge>
                        {it.fijoId && <Badge variant="outline" className="text-[10px]">fijo</Badge>}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {PERSONAS.tai} {fmt(it.parteTai)} · {PERSONAS.sendero} {fmt(it.parteSendero)}
                      </p>
                    </div>
                    <span className="text-sm font-semibold">{fmt(it.monto)}</span>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openGasto(g.id, it)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => eliminarGasto(it.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        );
      })}

      {/* Dialog gasto */}
      <Dialog open={gastoDialog} onOpenChange={setGastoDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{gastoEdit ? "Editar gasto" : "Nuevo gasto"}</DialogTitle></DialogHeader>
          <form onSubmit={submitGasto} className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input value={gastoForm.nombre} onChange={(e) => setGastoForm({ ...gastoForm, nombre: e.target.value })} required placeholder="Ej: Alquiler, Cena, Heladera…" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Monto *</Label>
                <Input type="number" value={gastoForm.monto} onChange={(e) => setGastoForm({ ...gastoForm, monto: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Grupo</Label>
                <select value={gastoForm.grupo} onChange={(e) => setGastoForm({ ...gastoForm, grupo: e.target.value })}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                  {GRUPOS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>¿Cómo se reparte?</Label>
              <select value={gastoForm.reparto} onChange={(e) => setGastoForm({ ...gastoForm, reparto: e.target.value })}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                {REPARTOS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </div>
            {gastoForm.reparto === "personal" && (
              <div className="space-y-2">
                <Label>¿Quién lo paga?</Label>
                <select value={gastoForm.personaPaga} onChange={(e) => setGastoForm({ ...gastoForm, personaPaga: e.target.value })}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="tai">{PERSONAS.tai}</option>
                  <option value="sendero">{PERSONAS.sendero}</option>
                </select>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setGastoDialog(false)}>Cancelar</Button>
              <Button type="submit">{gastoEdit ? "Guardar" : "Agregar"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog plantilla de fijos */}
      <FijosDialog open={fijosDialog} onClose={() => setFijosDialog(false)} onChanged={fetchData} />
    </div>
  );
}

/* ─── Gestión de plantilla de fijos ─── */
function FijosDialog({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: () => void }) {
  const [fijos, setFijos] = useState<Fijo[]>([]);
  const [form, setForm] = useState({ nombre: "", monto: "", reparto: "proporcional", personaPaga: "sendero" });
  const [editId, setEditId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/casa/fijos");
    setFijos(await res.json());
  }, []);
  useEffect(() => { if (open) load(); }, [open, load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/casa/fijos", {
      method: editId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, ...(editId ? { id: editId } : {}) }),
    });
    if (!res.ok) { toast.error("Error"); return; }
    setForm({ nombre: "", monto: "", reparto: "proporcional", personaPaga: "sendero" });
    setEditId(null);
    load(); onChanged();
  };

  const del = async (id: string) => {
    if (!confirm("¿Eliminar este fijo de la plantilla? (no borra los ya cargados en meses)")) return;
    await fetch(`/api/casa/fijos?id=${id}`, { method: "DELETE" });
    load(); onChanged();
  };

  const editar = (f: Fijo) => {
    setEditId(f.id);
    setForm({ nombre: f.nombre, monto: String(f.monto), reparto: f.reparto, personaPaga: f.personaPaga || "sendero" });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Gastos fijos (plantilla)</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">
          Definí acá los gastos que se repiten cada mes (alquiler, luz, cuotas…). Después, en cada mes,
          los traés con el botón &quot;Cargar fijos del mes&quot; y ajustás el monto si cambió.
        </p>
        <form onSubmit={submit} className="space-y-3 border-b pb-4">
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required />
            <Input type="number" placeholder="Monto" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} required />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select value={form.reparto} onChange={(e) => setForm({ ...form, reparto: e.target.value })}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm">
              {REPARTOS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            {form.reparto === "personal" ? (
              <select value={form.personaPaga} onChange={(e) => setForm({ ...form, personaPaga: e.target.value })}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                <option value="tai">{PERSONAS.tai}</option>
                <option value="sendero">{PERSONAS.sendero}</option>
              </select>
            ) : <div />}
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm">{editId ? "Guardar" : "Agregar fijo"}</Button>
            {editId && <Button type="button" size="sm" variant="outline" onClick={() => { setEditId(null); setForm({ nombre: "", monto: "", reparto: "proporcional", personaPaga: "sendero" }); }}>Cancelar</Button>}
          </div>
        </form>
        <div className="divide-y">
          {fijos.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">Todavía no cargaste fijos.</p>
          ) : fijos.map((f) => (
            <div key={f.id} className="py-2 flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium">{f.nombre}</span>
                <span className="text-xs text-muted-foreground ml-2">
                  {f.reparto === "personal" ? `Paga ${PERSONAS[f.personaPaga || ""]}` : f.reparto === "mitad" ? "50/50" : "Proporcional"}
                </span>
              </div>
              <span className="text-sm">{fmt(f.monto)}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => editar(f)}><Pencil className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => del(f.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
