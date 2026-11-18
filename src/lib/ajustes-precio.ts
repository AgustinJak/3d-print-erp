import { prisma } from "@/lib/prisma";
import { resumir, validarAjuste, type Ajuste, type CanalAjuste, type ResumenAjustes, type TipoAjuste } from "@/lib/ajustes-precio-reglas";

/** Los ajustes de precio guardados (docs/sdd/015). Las reglas están en ajustes-precio-reglas.ts. */

export interface AjusteGuardado extends Ajuste {
  id: string;
  modeloId: string;
  usuario: string | null;
  actualizadoEn: string;
}

const aVista = (a: { id: string; modeloId: string; canal: string; tipo: string; valor: unknown; hasta: Date | null; nota: string | null; usuario: string | null; actualizadoEn: Date }): AjusteGuardado => ({
  id: a.id,
  modeloId: a.modeloId,
  canal: a.canal as CanalAjuste,
  tipo: a.tipo as TipoAjuste,
  valor: Number(a.valor),
  hasta: a.hasta?.toISOString() ?? null,
  nota: a.nota,
  usuario: a.usuario,
  actualizadoEn: a.actualizadoEn.toISOString(),
});

/** Todos los ajustes (vigentes y vencidos), por producto. */
export async function ajustesPorModelo(tenantId: string, modeloIds?: string[]): Promise<Record<string, AjusteGuardado[]>> {
  const filas = await prisma.ajustePrecio.findMany({
    where: { tenantId, ...(modeloIds ? { modeloId: { in: modeloIds } } : {}) },
    orderBy: [{ canal: "asc" }, { tipo: "asc" }],
  });
  const out: Record<string, AjusteGuardado[]> = {};
  for (const f of filas) (out[f.modeloId] ??= []).push(aVista(f));
  return out;
}

/** Lo vigente de cada producto, resumido para el cálculo. */
export async function resumenesDeAjustes(tenantId: string): Promise<Map<string, ResumenAjustes>> {
  const todos = await ajustesPorModelo(tenantId);
  return new Map(Object.entries(todos).map(([id, l]) => [id, resumir(l)]));
}

export interface EntradaAjuste {
  modeloIds: string[];
  canal: CanalAjuste;
  tipo: TipoAjuste;
  valor: number;
  hasta?: string | null;
  nota?: string | null;
}

/** Crea o cambia el mismo ajuste en uno o varios productos (RN-3: uno por canal y tipo). */
export async function guardarAjuste(tenantId: string, usuario: string | null, e: EntradaAjuste): Promise<{ ok: true; productos: number } | { error: string }> {
  const error = validarAjuste(e);
  if (error) return { error };
  const ids = [...new Set((e.modeloIds ?? []).filter((x) => typeof x === "string" && x))];
  if (!ids.length) return { error: "Elegí al menos un producto" };
  const existen = await prisma.modelo.count({ where: { tenantId, id: { in: ids } } });
  if (existen !== ids.length) return { error: "Algún producto no existe" };
  const hasta = e.hasta ? new Date(e.hasta) : null;
  const nota = e.nota?.trim().slice(0, 200) || null;
  const valor = Number(e.valor);
  await prisma.$transaction(
    ids.map((modeloId) =>
      prisma.ajustePrecio.upsert({
        where: { tenantId_modeloId_canal_tipo: { tenantId, modeloId, canal: e.canal, tipo: e.tipo } },
        create: { tenantId, modeloId, canal: e.canal, tipo: e.tipo, valor, hasta, nota, usuario },
        update: { valor, hasta, nota, usuario, actualizadoEn: new Date() },
      })
    )
  );
  return { ok: true, productos: ids.length };
}

export async function borrarAjuste(tenantId: string, e: { modeloIds: string[]; canal: CanalAjuste; tipo: TipoAjuste }): Promise<number> {
  const r = await prisma.ajustePrecio.deleteMany({ where: { tenantId, modeloId: { in: e.modeloIds ?? [] }, canal: e.canal, tipo: e.tipo } });
  return r.count;
}
