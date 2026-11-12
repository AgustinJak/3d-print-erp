"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { json, pedir, pesos } from "@/components/producto/seccion";
import { LARGO_MAXIMO, problemasDelTitulo, reemplazarFinal } from "@/lib/copiar-ml-reglas";
import type { FuenteDeCopia, ResultadoDeCopia } from "@/lib/copiar-ml";

/**
 * Copiar publicaciones de Sendero 3D a otra cuenta de ML (docs/sdd/010, TASK-007). Mismas fotos,
 * descripción, precio y todo lo demás; el título cambia en su última parte y no puede quedar igual.
 * Se revisa contra ML sin crear nada, y al confirmar se crean pausadas y enlazadas.
 */

const TANDA_REVISAR = 5;
// Crear lleva varias llamadas por publicación (crear, pausar, descripción).
const TANDA_CREAR = 3;

type Fila = FuenteDeCopia & { nuevo: string; incluir: boolean; resultado?: ResultadoDeCopia };

export function CopiarAOtraCuenta({ mlas, onCerrar, onHecho }: { mlas: string[]; onCerrar: () => void; onHecho: () => void }) {
  const [destino, setDestino] = useState<{ id: string; nombre: string } | null | undefined>(undefined);
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revisadoCon, setRevisadoCon] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<{ que: "revisando" | "creando"; hechas: number; total: number } | null>(null);
  const [creadas, setCreadas] = useState(false);
  const [final, setFinal] = useState({ palabras: "1", texto: "" });

  useEffect(() => {
    let vigente = true;
    pedir<{ destino: { id: string; nombre: string } | null; fuentes: FuenteDeCopia[] }>(`/api/ml/copiar?mlas=${mlas.join(",")}`)
      .then((r) => {
        if (!vigente) return;
        setDestino(r.destino);
        setFilas(r.fuentes.map((f) => ({ ...f, nuevo: f.titulo, incluir: !f.copia && !f.problema })));
      })
      .catch((e) => vigente && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      vigente = false;
    };
  }, [mlas]);

  const incluidas = useMemo(() => (filas ?? []).filter((f) => f.incluir), [filas]);
  const clave = JSON.stringify(incluidas.map((f) => [f.mla, f.nuevo.trim()]));
  const revisado = revisadoCon === clave;
  const aptas = revisado ? incluidas.filter((f) => f.resultado?.estado === "revisada") : [];
  const conProblemaDeTitulo = incluidas.filter((f) => problemasDelTitulo(f.titulo, f.nuevo).length).length;

  const cambiar = (mla: string, cambio: Partial<Fila>) => setFilas((prev) => prev && prev.map((f) => (f.mla === mla ? { ...f, ...cambio, resultado: cambio.nuevo !== undefined ? undefined : f.resultado } : f)));

  async function mandar(crear: boolean) {
    if (!destino || !filas) return;
    const lista = crear ? aptas : incluidas;
    const tanda = crear ? TANDA_CREAR : TANDA_REVISAR;
    setOcupado({ que: crear ? "creando" : "revisando", hechas: 0, total: lista.length });
    const resultados = new Map<string, ResultadoDeCopia>();
    try {
      for (let i = 0; i < lista.length; i += tanda) {
        const r = await pedir<{ resultados: ResultadoDeCopia[] }>(
          "/api/ml/copiar",
          json("POST", { destino: destino.id, crear, pedidos: lista.slice(i, i + tanda).map((f) => ({ mla: f.mla, titulo: f.nuevo.trim() })) })
        );
        for (const x of r.resultados) resultados.set(x.mla, x);
        setFilas((prev) => prev && prev.map((f) => (resultados.has(f.mla) ? { ...f, resultado: resultados.get(f.mla) } : f)));
        setOcupado({ que: crear ? "creando" : "revisando", hechas: Math.min(lista.length, i + tanda), total: lista.length });
      }
    } catch (e) {
      toast.error(`Se cortó a mitad de camino: ${e instanceof Error ? e.message : e}`);
    }
    setOcupado(null);
    if (crear) {
      const ok = [...resultados.values()].filter((x) => x.estado === "creada").length;
      if (ok) toast.success(`${ok} ${ok === 1 ? "publicación creada" : "publicaciones creadas"} en ${destino.nombre}, pausadas.`);
      setCreadas(true);
      onHecho();
    } else setRevisadoCon(clave);
  }

  if (error) return <p className="text-sm text-red-600 flex gap-2"><XCircle className="h-4 w-4 mt-0.5 shrink-0" /> {error}</p>;
  if (destino === undefined || !filas) return <p className="text-sm text-muted-foreground flex items-center gap-2 py-6 justify-center"><Loader2 className="h-4 w-4 animate-spin" /> Leyendo las publicaciones…</p>;
  if (!destino) return <p className="text-sm text-muted-foreground">No hay otra cuenta de Mercado Libre conectada. Conectala en Integraciones › Mercado Libre.</p>;
  if (!filas.length)
    return (
      <div className="space-y-3 text-sm">
        <p className="text-muted-foreground">Lo elegido no tiene publicaciones de Sendero 3D para copiar.</p>
        <DialogFooter>
          <Button onClick={onCerrar}>Cerrar</Button>
        </DialogFooter>
      </div>
    );

  return (
    <div className="space-y-3 text-sm min-w-0">
      {!creadas && (
        <div className="rounded-md border bg-muted/30 p-2.5 space-y-1.5">
          <p className="text-xs font-medium">Cambiar el final de varios títulos a la vez</p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Reemplazar las últimas</span>
            <select value={final.palabras} onChange={(e) => setFinal((p) => ({ ...p, palabras: e.target.value }))} className="h-8 rounded-md border border-input bg-background px-2 text-xs">
              {["0", "1", "2", "3"].map((n) => (
                <option key={n} value={n}>
                  {n === "0" ? "0 (agregar al final)" : `${n} ${n === "1" ? "palabra" : "palabras"}`}
                </option>
              ))}
            </select>
            <span className="text-xs text-muted-foreground">por</span>
            <Input value={final.texto} onChange={(e) => setFinal((p) => ({ ...p, texto: e.target.value }))} placeholder="Coleccionable" className="h-8 w-40" />
            <Button
              size="sm"
              variant="outline"
              disabled={!final.texto.trim() || !!ocupado}
              onClick={() => setFilas((prev) => prev && prev.map((f) => (f.incluir && problemasDelTitulo(f.titulo, f.nuevo).some((p) => p.startsWith("Es igual")) ? { ...f, nuevo: reemplazarFinal(f.titulo, Number(final.palabras), final.texto), resultado: undefined } : f)))}
            >
              Aplicar a las que siguen iguales
            </Button>
          </div>
        </div>
      )}

      <div className="max-h-[50vh] overflow-y-auto rounded-md border divide-y">
        {filas.map((f) => {
          const propios = problemasDelTitulo(f.titulo, f.nuevo);
          const r = f.resultado;
          const bloqueada = !!f.copia || !!f.problema;
          return (
            <div key={f.mla} className={`px-3 py-2 space-y-1 ${!f.incluir ? "opacity-60" : ""}`}>
              <div className="flex items-start gap-2">
                <input type="checkbox" className="mt-2 h-4 w-4 accent-primary" checked={f.incluir} disabled={bloqueada || creadas || !!ocupado} onChange={(e) => cambiar(f.mla, { incluir: e.target.checked })} aria-label={`Copiar ${f.titulo}`} />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-xs text-muted-foreground truncate" title={f.titulo}>
                    {f.mla} · {f.tipo} · {pesos(f.precio)} · {f.fotos} {f.fotos === 1 ? "foto" : "fotos"}
                    {f.catalogo && " · de catálogo"}
                    {f.estado === "paused" && " · pausada"} · <span className="text-foreground/80">{f.titulo}</span>
                  </p>
                  {f.copia ? (
                    <p className="text-xs text-emerald-700 dark:text-emerald-400">Ya está copiada: {f.copia}</p>
                  ) : f.problema ? (
                    <p className="text-xs text-amber-700 dark:text-amber-400">{f.problema}</p>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Input value={f.nuevo} onChange={(e) => cambiar(f.mla, { nuevo: e.target.value })} disabled={creadas || !!ocupado || !f.incluir} className="h-8" aria-label="Título en la otra cuenta" />
                      <span className={`text-[11px] tabular-nums shrink-0 ${f.nuevo.trim().length > LARGO_MAXIMO ? "text-red-600" : "text-muted-foreground"}`}>
                        {f.nuevo.trim().length}/{LARGO_MAXIMO}
                      </span>
                    </div>
                  )}
                  {f.incluir && !bloqueada && !r && propios.map((p) => <p key={p} className="text-xs text-amber-700 dark:text-amber-400">{p}</p>)}
                  {r && (
                    <div className="space-y-0.5">
                      <p className="text-xs flex items-center gap-1.5">
                        {r.estado === "creada" ? (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Creada, pausada: {r.nueva}
                            {r.link && (
                              <a href={r.link} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-0.5 hover:underline">
                                abrir <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </>
                        ) : r.estado === "revisada" ? (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> ML la acepta
                          </>
                        ) : (
                          <>
                            <XCircle className="h-3.5 w-3.5 text-red-600" /> {r.estado === "error" ? "No se creó" : "No se puede copiar"}
                          </>
                        )}
                      </p>
                      {r.errores.map((e) => (
                        <p key={e} className="text-xs text-red-600">{e}</p>
                      ))}
                      {r.avisos.slice(0, 3).map((a) => (
                        <p key={a} className="text-xs text-muted-foreground flex gap-1">
                          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" /> {a}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        {creadas
          ? `Quedaron pausadas en ${destino.nombre} y enlazadas a las mismas variantes. Activalas en ML cuando quieras.`
          : revisado
            ? `${aptas.length} de ${incluidas.length} se pueden copiar a ${destino.nombre}. Los avisos de envío no frenan la creación.`
            : conProblemaDeTitulo
              ? `${conProblemaDeTitulo} ${conProblemaDeTitulo === 1 ? "título sigue igual o tiene un problema" : "títulos siguen iguales o tienen un problema"}: cambialos antes de revisar.`
              : `Van las mismas fotos, descripción, precio y stock. Primero revisá en ML: no crea nada.`}
      </p>

      <DialogFooter>
        <Button variant="outline" onClick={onCerrar} disabled={!!ocupado}>
          {creadas ? "Cerrar" : "Cancelar"}
        </Button>
        {!creadas && (
          <>
            <Button variant="outline" onClick={() => mandar(false)} disabled={!incluidas.length || conProblemaDeTitulo > 0 || !!ocupado}>
              {ocupado?.que === "revisando" ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> {ocupado.hechas} de {ocupado.total}
                </>
              ) : (
                "Revisar en ML"
              )}
            </Button>
            <Button onClick={() => mandar(true)} disabled={!aptas.length || !!ocupado} title={!revisado ? "Primero revisá en ML" : undefined}>
              {ocupado?.que === "creando" ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> {ocupado.hechas} de {ocupado.total}
                </>
              ) : (
                `Crear ${aptas.length} pausadas`
              )}
            </Button>
          </>
        )}
      </DialogFooter>
    </div>
  );
}
