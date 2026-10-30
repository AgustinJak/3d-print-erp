import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getMlAccount, mlFetch } from "@/lib/mercadolibre";
import { cargoFijo, RECARGO_CUOTAS_POR_DEFECTO, type TarifasMl } from "@/lib/tarifas-ml-reglas";

export { cargoFijo, RECARGO_CUOTAS_POR_DEFECTO, type TarifasMl };

/**
 * Lo que cobra Mercado Libre de verdad (docs/sdd/006, spec 003), leído de ML y guardado con
 * fecha en `config_tenant.data.tarifasMl`.
 *
 * Tres cosas, cada una de donde es confiable:
 *
 * - **El % de la categoría** sale del cotizador (`/sites/MLA/listing_prices`), que devuelve todos
 *   los tipos de publicación en una llamada. Va de 13,5 % a 16 % en las categorías de Sendero.
 * - **El cargo fijo** depende del precio que paga el cliente, por tramos (el 2026-10-28: $1.330
 *   hasta $15.000, $2.740 hasta $24.000, $3.320 hasta $33.000, $0 después). Los cortes se buscan
 *   en el cotizador; no se escriben a mano.
 * - **El recargo por 3 cuotas** sale de las ventas, no del cotizador: el cotizador dice 12,9 %
 *   para toda Premium y en las ventas con campaña de 3 cuotas ML cobró 8,5 % (bitácora de la 006).
 */

/** Las tarifas se vuelven a leer si tienen más que esto. */
const VIGENCIA_MS = 24 * 60 * 60 * 1000;
const CLAVE = "tarifasMl";

interface CotizacionMl {
  listing_type_id: string;
  sale_fee_details?: { meli_percentage_fee?: number; fixed_fee?: number; financing_add_on_fee?: number };
}

async function cotizar(tenantId: string, precio: number, categoria: string): Promise<CotizacionMl[]> {
  const r = await mlFetch<CotizacionMl[] | CotizacionMl>(tenantId, `/sites/MLA/listing_prices?price=${Math.round(precio)}&category_id=${categoria}`);
  return Array.isArray(r) ? r : [r];
}

const clasica = (cs: CotizacionMl[]) => cs.find((c) => c.listing_type_id === "gold_special")?.sale_fee_details;

/**
 * Los tramos del cargo fijo: se muestrea cada $1.000 hasta $60.000 y se busca el corte exacto
 * entre dos muestras que difieren. Unas 60 consultas, una vez por día.
 */
async function leerTramos(tenantId: string, categoria: string): Promise<TarifasMl["fijos"]> {
  const fijoA = async (p: number) => clasica(await cotizar(tenantId, p, categoria))?.fixed_fee ?? 0;
  const precios = Array.from({ length: 60 }, (_, i) => (i + 1) * 1000);
  const muestras: Array<{ p: number; fijo: number }> = [];
  for (let i = 0; i < precios.length; i += 8) {
    const lote = precios.slice(i, i + 8);
    muestras.push(...(await Promise.all(lote.map(async (p) => ({ p, fijo: await fijoA(p) })))));
  }
  const tramos: TarifasMl["fijos"] = [{ desde: 0, monto: muestras[0].fijo }];
  for (let i = 1; i < muestras.length; i++) {
    if (muestras[i].fijo === muestras[i - 1].fijo) continue;
    // El corte está entre las dos muestras: búsqueda binaria al peso.
    let abajo = muestras[i - 1].p;
    let arriba = muestras[i].p;
    while (arriba - abajo > 1) {
      const medio = Math.floor((abajo + arriba) / 2);
      if ((await fijoA(medio)) === muestras[i - 1].fijo) abajo = medio;
      else arriba = medio;
    }
    tramos.push({ desde: arriba, monto: muestras[i].fijo });
  }
  return tramos;
}

interface OrdenMl {
  order_items: Array<{ item: { id: string; category_id?: string }; unit_price: number; sale_fee: number; listing_type_id?: string }>;
}

const mediana = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
};

/**
 * El recargo por cuotas cobrado: en cada venta Premium, lo que ML cobró de más sobre el % de la
 * categoría y el cargo fijo. Las últimas 200 ventas pagadas.
 */
async function leerRecargoCobrado(
  tenantId: string,
  categorias: Record<string, number>,
  fijos: TarifasMl["fijos"]
): Promise<TarifasMl["recargoCuotas"]> {
  const cuenta = await getMlAccount(tenantId);
  if (!cuenta) return { general: RECARGO_CUOTAS_POR_DEFECTO, porPublicacion: {}, ventas: 0 };
  const porPub = new Map<string, number[]>();
  for (let offset = 0; offset < 200; offset += 50) {
    const r = await mlFetch<{ results: OrdenMl[] }>(
      tenantId,
      `/orders/search?seller=${cuenta.mlUserId}&order.status=paid&sort=date_desc&limit=50&offset=${offset}`
    ).catch(() => ({ results: [] as OrdenMl[] }));
    for (const o of r.results) {
      for (const it of o.order_items) {
        const pct = it.item.category_id ? categorias[it.item.category_id] : undefined;
        if (it.listing_type_id !== "gold_pro" || pct == null || !(it.unit_price > 0)) continue;
        const recargo = ((it.sale_fee - cargoFijo({ fijos }, it.unit_price)) / it.unit_price) * 100 - pct;
        // Un recargo fuera de rango es otra cosa (un reintegro, una bonificación): no se usa.
        if (recargo < 0 || recargo > 30) continue;
        porPub.set(it.item.id, [...(porPub.get(it.item.id) ?? []), recargo]);
      }
    }
    if (r.results.length < 50) break;
  }
  const todos = [...porPub.values()].flat();
  return {
    general: Math.round((mediana(todos) ?? RECARGO_CUOTAS_POR_DEFECTO) * 100) / 100,
    porPublicacion: Object.fromEntries([...porPub].map(([mla, xs]) => [mla, Math.round(mediana(xs)! * 100) / 100])),
    ventas: todos.length,
  };
}

export async function tarifasGuardadas(tenantId: string): Promise<TarifasMl | null> {
  const cfg = await prisma.configTenant.findUnique({ where: { tenantId } });
  const t = ((cfg?.data ?? {}) as Record<string, unknown>)[CLAVE];
  return t && typeof t === "object" ? (t as TarifasMl) : null;
}

/**
 * Las tarifas al día para estas categorías: lee de ML lo que falta o lo que tiene más de un día, y
 * lo guarda. Sólo `GET`.
 */
export async function actualizarTarifas(tenantId: string, categorias: string[]): Promise<TarifasMl> {
  const previas = await tarifasGuardadas(tenantId);
  const vigentes = previas && Date.now() - new Date(previas.leidoEn).getTime() < VIGENCIA_MS;
  const faltan = categorias.filter((c) => !vigentes || previas!.categorias[c] == null);
  if (vigentes && !faltan.length) return previas!;

  const cats: Record<string, number> = vigentes ? { ...previas!.categorias } : {};
  for (let i = 0; i < faltan.length; i += 6) {
    await Promise.all(
      faltan.slice(i, i + 6).map(async (c) => {
        const pct = clasica(await cotizar(tenantId, 20000, c).catch(() => []))?.meli_percentage_fee;
        if (typeof pct === "number") cats[c] = pct;
      })
    );
  }
  const masUsada = categorias[0] ?? Object.keys(cats)[0];
  const fijos = vigentes ? previas!.fijos : masUsada ? await leerTramos(tenantId, masUsada) : [];
  const recargoCuotas = await leerRecargoCobrado(tenantId, cats, fijos);

  const t: TarifasMl = { leidoEn: new Date().toISOString(), categorias: cats, fijos, recargoCuotas };
  const cfg = await prisma.configTenant.findUnique({ where: { tenantId } });
  const data = { ...((cfg?.data ?? {}) as Record<string, unknown>), [CLAVE]: t };
  await prisma.configTenant.upsert({
    where: { tenantId },
    create: { tenantId, data: data as unknown as Prisma.InputJsonValue },
    update: { data: data as unknown as Prisma.InputJsonValue },
  });
  return t;
}
