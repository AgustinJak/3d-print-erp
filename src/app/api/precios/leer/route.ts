export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { leerPreciosMl } from "@/lib/precios-ml";
import { leerPreciosShop } from "@/lib/precios-shop";
import { armarPropuesta } from "@/lib/precios-propuesta";
import { estaVieja, soltarTurno, tomarTurno, ultimaLectura, type CanalLeido } from "@/lib/lectura-de-canales";
import { getAuthenticatedTenantNonDemo } from "@/lib/tenant";
import { NextRequest, NextResponse } from "next/server";

/**
 * Lee los precios publicados de un canal y los guarda en el mapeo (spec 004, RN-2). No cambia nada
 * en el canal.
 *
 *   POST ?canal=mercadolibre   → GET /items, /prices y /sale_price de cada publicación mapeada
 *   POST ?canal=shop           → el endpoint de precios del Shop con simular: true
 *
 * Con `&auto=1` (lo piden Precios y Productos al entrar, desde el 2026-11-18) sólo lee si la
 * última lectura terminada tiene más de una hora; si no, contesta `{ saltada: "al día" }`. Nunca
 * corren dos lecturas del mismo canal a la vez (`lectura-de-canales.ts`): la automática contesta
 * `{ saltada: "en curso" }` y la del botón, 409.
 */
export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getAuthenticatedTenantNonDemo();
    const canal = request.nextUrl.searchParams.get("canal");
    if (canal !== "shop" && canal !== "mercadolibre") return NextResponse.json({ error: "canal tiene que ser mercadolibre o shop" }, { status: 400 });
    const auto = request.nextUrl.searchParams.get("auto") === "1";

    if (auto) {
      const u = await ultimaLectura(tenantId, canal);
      if (!estaVieja(u.hecha)) return NextResponse.json({ saltada: "al día", hecha: u.hecha?.toISOString() ?? null });
      if (u.enCurso) return NextResponse.json({ saltada: "en curso", hecha: u.hecha?.toISOString() ?? null });
    }
    if (!(await tomarTurno(tenantId, canal as CanalLeido))) {
      return auto
        ? NextResponse.json({ saltada: "en curso", hecha: null })
        : NextResponse.json({ error: `Ya se está leyendo ${canal === "shop" ? "la web" : "Mercado Libre"} desde otra pantalla. Esperá un par de minutos.` }, { status: 409 });
    }

    let termino = false;
    try {
      let r;
      if (canal === "shop") {
        // El Shop devuelve lo que se cobra hoy simulando con los precios propuestos.
        const propuesta = await armarPropuesta(tenantId);
        const propuestos = new Map(propuesta.canales.filter((f) => f.canal === "shop").map((f) => [f.clave, f.propuesto]));
        r = await leerPreciosShop(tenantId, (clave) => propuestos.get(clave) ?? null);
      } else {
        r = await leerPreciosMl(tenantId);
      }
      termino = true;
      return NextResponse.json(r);
    } finally {
      await soltarTurno(tenantId, canal, termino).catch((e) => console.error("[precios/leer] turno:", e));
    }
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
