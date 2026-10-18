import type { Prisma, PrismaClient } from "@/generated/prisma";
import { variantesElegidas, type VarianteDelModelo } from "@/lib/variantes-item";

/**
 * Combinaciones vendibles: lo que se vende, con SKU propio (docs/sdd/001, spec 001).
 *
 * "Tanjiro Katana vieja 95cm · Con Funda" es lo que se cobra, se reserva y se
 * despacha. Antes no existía como cosa: cada línea de pedido lo reconstruía con
 * `modeloId` + un JSON de variantes, y cada canal lo armaba a su manera. Una
 * combinación es un modelo más las variantes que la definen (cero o más), y es a
 * lo que apuntan las líneas de pedido y el mapeo de cada canal.
 *
 * Las funciones de arriba son puras: las prueban los scripts sin base.
 */

/** La identidad: el mismo modelo con las mismas variantes, en cualquier orden. */
export function claveDe(modeloId: string, variantes: string[]): string {
  return `${modeloId}|${[...new Set(variantes)].sort().join(",")}`;
}

/** "Tanjiro Katana vieja 95cm · Con Funda". Las variantes, en el orden recibido. */
export function nombreDe(modelo: string, variantes: string[]): string {
  return [modelo.trim(), ...variantes.map((v) => v.trim())].filter(Boolean).join(" · ");
}

/** El texto de un nombre en mayúsculas, sin acentos ni símbolos (como `abreviar` de sku.ts). */
function letras(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
}

/**
 * El sufijo que propone una variante, y cómo se alarga si choca.
 *
 * "Con Funda" → CF y "Sin Funda" → SF: son la mitad de las variantes del
 * catálogo y así se leen de un vistazo en ML y en el paquete. Lo mismo para
 * cualquier accesorio ("Con Exhibidor" → CE). El resto, las tres primeras letras
 * (`Rosa` → ROS), y si choca con otra variante del mismo modelo, una letra más
 * (`Verde (Metalizado)` → VERD).
 */
function sufijoPosible(nombre: string, largo: number): string {
  const m = /^\s*(con|sin)\s+(.+)$/i.exec(nombre);
  if (m) {
    const resto = letras(m[2]);
    const base = (m[1][0] + (resto[0] ?? "X")).toUpperCase();
    // Al chocar se alarga con el resto del accesorio: CF → CFU → CFUN.
    return largo <= 3 ? base : base + resto.slice(1, largo - 2);
  }
  const l = letras(nombre);
  // Nombres de menos de tres letras ("V", "Rm") quedan como están: son legibles.
  return l.slice(0, Math.max(largo, 1)) || "X";
}

/**
 * El sufijo de cada variante de un modelo, sin choques entre ellas.
 *
 * Se calcula sobre todas las variantes del modelo y en un orden fijo (por nombre),
 * para que la misma variante reciba siempre el mismo sufijo. Igual, un SKU se
 * guarda una vez y no se recalcula: esto sólo decide el de las combinaciones
 * nuevas.
 */
export function sufijosDe(variantes: Array<{ id: string; nombre: string }>): Map<string, string> {
  const orden = [...variantes].sort((a, b) => letras(a.nombre).localeCompare(letras(b.nombre)) || a.id.localeCompare(b.id));
  const usados = new Set<string>();
  const out = new Map<string, string>();
  for (const v of orden) {
    let largo = 3;
    let s = sufijoPosible(v.nombre, largo);
    // Hasta que no choque o ya no haya más letras para sumar.
    while (usados.has(s)) {
      const siguiente = sufijoPosible(v.nombre, ++largo);
      if (siguiente === s) {
        s = `${s}${largo}`; // mismo nombre limpio: se distingue con un número
        break;
      }
      s = siguiente;
    }
    usados.add(s);
    out.set(v.id, s);
  }
  return out;
}

/** SKU del modelo + un sufijo por variante, en mayúsculas. null si el modelo no tiene SKU. */
export function skuDe(skuModelo: string | null | undefined, sufijos: string[]): string | null {
  const base = skuModelo?.trim();
  if (!base) return null;
  return [base, ...sufijos].join("-").toUpperCase();
}

/* ─────────────────────────────── con base ─────────────────────────────── */

type Db = PrismaClient | Prisma.TransactionClient;

export interface CombinacionCreada {
  id: string;
  sku: string | null;
  nombre: string;
  creada: boolean;
}

/**
 * Devuelve la combinación de ese modelo con esas variantes, creándola si no
 * existe (spec 001, CA-5). Las variantes tienen que ser del modelo.
 *
 * Si el SKU calculado ya lo tiene otra combinación (pasa si un modelo tuvo
 * variantes que se renombraron), se alarga el sufijo de la última variante hasta
 * que no choque: un SKU nunca se reutiliza.
 */
export async function asegurarCombinacion(
  db: Db,
  tenantId: string,
  modeloId: string,
  varianteIds: string[],
  opts: { activo?: boolean } = {}
): Promise<CombinacionCreada> {
  const clave = claveDe(modeloId, varianteIds);
  const existente = await db.combinacion.findUnique({ where: { tenantId_clave: { tenantId, clave } } });
  if (existente) return { id: existente.id, sku: existente.sku, nombre: existente.nombre, creada: false };

  const modelo = await db.modelo.findFirst({
    where: { id: modeloId, tenantId },
    select: { nombre: true, sku: true, variantes: { select: { id: true, nombre: true } } },
  });
  if (!modelo) throw new Error(`modelo ${modeloId} no existe en ${tenantId}`);

  const ids = [...new Set(varianteIds)].sort();
  const elegidas = ids.map((id) => {
    const v = modelo.variantes.find((x) => x.id === id);
    if (!v) throw new Error(`la variante ${id} no es de "${modelo.nombre}"`);
    return v;
  });
  // En el nombre, en el orden en que se leen: por nombre de variante.
  const enOrden = [...elegidas].sort((a, b) => a.nombre.localeCompare(b.nombre));
  const sufijos = sufijosDe(modelo.variantes);
  const partes = enOrden.map((v) => sufijos.get(v.id)!);

  let sku = skuDe(modelo.sku, partes);
  for (let extra = 1; sku && extra <= 9; extra++) {
    const choca = await db.combinacion.findUnique({ where: { tenantId_sku: { tenantId, sku } } });
    if (!choca) break;
    sku = skuDe(modelo.sku, [...partes.slice(0, -1), `${partes.at(-1) ?? ""}${extra}`]);
  }

  const creada = await db.combinacion.create({
    data: {
      tenantId,
      modeloId,
      variantes: ids,
      clave,
      sku,
      nombre: nombreDe(modelo.nombre, enOrden.map((v) => v.nombre)),
      activo: opts.activo ?? true,
    },
  });
  return { id: creada.id, sku: creada.sku, nombre: creada.nombre, creada: true };
}

export interface ResultadoSiembra {
  creadas: number;
  existentes: number;
  /** Modelos activos sin SKU: sus combinaciones quedan sin SKU hasta que lo tengan (spec 001, RN-4). */
  faltanDatos: Array<{ modeloId: string; nombre: string }>;
  /** Lo que se creó o se crearía, para revisarlo. */
  detalle: Array<{ nombre: string; sku: string | null; nueva: boolean }>;
}

/**
 * Siembra las combinaciones del catálogo (spec 001, RN-3): por cada modelo activo,
 * una por cada variante activa; si no tiene variantes, una sola, sin variantes.
 * Idempotente: lo que ya existe no se toca. Con `simular` no escribe nada.
 *
 * Las combinaciones de más de una variante no se siembran: hoy ningún modelo
 * combina dos ejes. Si aparecen, se crean a mano o desde el mapeo.
 */
export async function sembrarCombinaciones(
  db: PrismaClient,
  tenantId: string,
  opts: { simular?: boolean } = {}
): Promise<ResultadoSiembra> {
  const modelos = await db.modelo.findMany({
    where: { tenantId, activo: true, consolidadoEnId: null },
    select: {
      id: true,
      nombre: true,
      sku: true,
      variantes: { select: { id: true, nombre: true, activo: true } },
    },
    orderBy: { nombre: "asc" },
  });

  const out: ResultadoSiembra = { creadas: 0, existentes: 0, faltanDatos: [], detalle: [] };
  for (const m of modelos) {
    if (!m.sku?.trim()) out.faltanDatos.push({ modeloId: m.id, nombre: m.nombre });
    const activas = m.variantes.filter((v) => v.activo);
    const grupos = activas.length === 0 ? [[]] : activas.map((v) => [v.id]);

    for (const ids of grupos) {
      if (opts.simular) {
        const ya = await db.combinacion.findUnique({
          where: { tenantId_clave: { tenantId, clave: claveDe(m.id, ids) } },
          select: { id: true },
        });
        const sufijos = sufijosDe(m.variantes);
        const nombres = ids.map((id) => m.variantes.find((v) => v.id === id)!.nombre);
        out.detalle.push({
          nombre: nombreDe(m.nombre, nombres),
          sku: skuDe(m.sku, ids.map((id) => sufijos.get(id)!)),
          nueva: !ya,
        });
        if (ya) out.existentes++;
        else out.creadas++;
        continue;
      }
      const c = await asegurarCombinacion(db, tenantId, m.id, ids);
      out.detalle.push({ nombre: c.nombre, sku: c.sku, nueva: c.creada });
      if (c.creada) out.creadas++;
      else out.existentes++;
    }
  }
  return out;
}

/**
 * La combinación que le corresponde a una línea de pedido guardada (spec 003, RN-1).
 *
 * El modelo de la línea más sus variantes: las que tienen `varianteId`, y en las
 * líneas viejas del diálogo, las que se reconocen por nombre (la misma regla que
 * `variantesElegidas`). Devuelve `null` si la línea no tiene modelo.
 */
export function combinacionDeLinea(
  linea: { modeloId: string | null; variantesInfo: unknown },
  variantesDelModelo: VarianteDelModelo[]
): { modeloId: string; variantes: string[] } | null {
  if (!linea.modeloId) return null;
  return { modeloId: linea.modeloId, variantes: variantesElegidas(linea.variantesInfo, variantesDelModelo).sort() };
}

export interface ResultadoBackfill {
  lineas: number;
  yaTenian: number;
  asignadas: number;
  combinacionesCreadas: number;
  sinModelo: number;
  /** Lo que no se pudo resolver y por qué. */
  problemas: Array<{ itemId: string; motivo: string }>;
}

/**
 * Completa `combinacionId` en las líneas que ya existían (spec 003, REQ-4).
 *
 * La combinación sale de `combinacionDeLinea`. Si no existe se crea, desactivada
 * cuando el modelo o alguna variante ya no están activos (el historial cuenta lo
 * que se vendió entonces). No toca `modeloId`, precios ni costos. Con `simular`
 * no escribe nada.
 */
export async function completarCombinacionesDeLineas(
  db: PrismaClient,
  tenantId: string,
  opts: { simular?: boolean } = {}
): Promise<ResultadoBackfill> {
  const items = await db.itemPedido.findMany({
    where: { pedido: { tenantId } },
    select: {
      id: true,
      modeloId: true,
      combinacionId: true,
      variantesInfo: true,
      modelo: {
        select: {
          activo: true,
          consolidadoEnId: true,
          variantes: { select: { id: true, nombre: true, precioAdicional: true, costoFabAdicional: true, activo: true } },
        },
      },
    },
  });

  const out: ResultadoBackfill = { lineas: items.length, yaTenian: 0, asignadas: 0, combinacionesCreadas: 0, sinModelo: 0, problemas: [] };
  const porClave = new Map(
    (await db.combinacion.findMany({ where: { tenantId }, select: { id: true, clave: true } })).map((c) => [c.clave, c.id])
  );
  const asignar = new Map<string, string[]>(); // combinacionId (o clave a crear) → itemIds

  for (const it of items) {
    if (it.combinacionId) {
      out.yaTenian++;
      continue;
    }
    if (!it.modeloId || !it.modelo) {
      out.sinModelo++;
      continue;
    }
    const c = combinacionDeLinea(it, it.modelo.variantes)!;
    const clave = claveDe(c.modeloId, c.variantes);
    let id = porClave.get(clave);
    if (!id) {
      // El modelo solo, de un modelo que tiene variantes (una katana vendida sin
      // decir si llevaba funda), queda como registro pero desactivado: de acá en
      // adelante cada venta tiene que decir cuál.
      const ambigua = c.variantes.length === 0 && it.modelo.variantes.some((v) => v.activo);
      const activa =
        it.modelo.activo &&
        !it.modelo.consolidadoEnId &&
        !ambigua &&
        c.variantes.every((v) => it.modelo!.variantes.find((x) => x.id === v)?.activo);
      if (opts.simular) {
        id = `nueva:${clave}`;
      } else {
        try {
          id = (await asegurarCombinacion(db, tenantId, c.modeloId, c.variantes, { activo: activa })).id;
        } catch (e) {
          out.problemas.push({ itemId: it.id, motivo: e instanceof Error ? e.message : String(e) });
          continue;
        }
      }
      porClave.set(clave, id);
      out.combinacionesCreadas++;
    }
    asignar.set(id, [...(asignar.get(id) ?? []), it.id]);
    out.asignadas++;
  }

  if (!opts.simular) {
    for (const [combinacionId, ids] of asignar) {
      await db.itemPedido.updateMany({ where: { id: { in: ids }, combinacionId: null }, data: { combinacionId } });
    }
  }
  return out;
}

/**
 * Las combinaciones de estos ids que son del tenant, para validar lo que manda el
 * diálogo de pedido (spec 003). Un id ajeno o inventado no está en el mapa: la
 * línea se guarda sin combinación, como antes.
 */
export async function combinacionesPorId(
  db: Db,
  tenantId: string,
  ids: Array<string | null | undefined>
): Promise<Map<string, { modeloId: string }>> {
  const validos = [...new Set(ids.filter((x): x is string => typeof x === "string" && x.length > 0))];
  if (validos.length === 0) return new Map();
  const cs = await db.combinacion.findMany({ where: { tenantId, id: { in: validos } }, select: { id: true, modeloId: true } });
  return new Map(cs.map((c) => [c.id, { modeloId: c.modeloId }]));
}
