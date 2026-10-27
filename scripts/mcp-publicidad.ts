/**
 * MCP local de publicidad de Mercado Libre (docs/sdd/005, spec 003).
 *
 * Una sesión de Claude Code abierta en este repo lo levanta solo por `.mcp.json`. Corre en la PC
 * con el `.env` del ERP y usa las mismas funciones que la página Publicidad: mismo cálculo de
 * margen, mismas reglas para cambiar y mismo registro (`cambios_publicidad`, origen `claude`).
 *
 * Las herramientas de escritura, sin `aplicar: true`, sólo devuelven la vista previa. Con
 * `aplicar`, Claude Code le pide permiso a Agustín en cada llamada: esa es la confirmación.
 *
 * Probarlo a mano: npx @modelcontextprotocol/inspector node_modules/.bin/tsx --env-file=.env scripts/mcp-publicidad.ts
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { aplicarCambio, historialPublicidad, resumenPublicidad, vistaPreviaDeCambio, type FilaAnuncio, type PedidoDeCambio, type ResumenPublicidad } from "@/lib/publicidad-ml";
import { rangoDe, type Periodo } from "@/lib/publicidad-reglas";

// Bodega y la publicidad son de un solo negocio: como en `altas-bodega.ts`.
const TENANT = "sendero3d";

const INSTRUCCIONES = `Publicidad de Mercado Libre (Product Ads) de Sendero 3D, con el costo real de cada producto del ERP.

Cómo leer los números:
- roas = ventas atribuidas / gasto. roas_minimo = el ROAS de equilibrio: debajo, cada venta por publicidad pierde plata. Sale del precio, el costo de Bodega y los gastos de venta de ML (comisión, cuotas, IIBB, cargo fijo, envío).
- ganancia_estimada = ventas atribuidas × margen del anuncio − gasto. Es estimada: las ventas indirectas se cuentan con el margen del anuncio. cobertura = qué parte del gasto tiene costo conocido.
- perdido_por_presupuesto = fracción de impresiones que la campaña no ganó por falta de presupuesto (0,24 = 24 %).
- Las campañas con es_shay=true son de otro negocio (Shay Juguetes) que comparte la cuenta: no tienen costo en el ERP. No las toques salvo que Agustín lo pida.

Cómo cambiar:
- cambiar_campana y cambiar_anuncio sin aplicar=true devuelven la vista previa y no tocan nada. Mostrásela a Agustín y aplicá sólo con su OK.
- Cada cambio de campaña la vuelve a poner en aprendizaje unos días (fuente no oficial): proponé pocos cambios y mirá ultimo_cambio antes.
- Un presupuesto que cambia más de 50 % o una campaña de Shay piden confirmado_aparte=true, también con su OK.
- Escribí en castellano rioplatense, sin jerga: Agustín no es especialista en publicidad.`;

const PERIODO = z.enum(["7d", "30d", "mes", "mes-pasado"]).optional().describe("Período de las métricas. Por defecto, 30 días.");

/** El resumen tarda unos segundos: se guarda un par de minutos para encadenar preguntas. */
const guardado = new Map<Periodo, { en: number; r: ResumenPublicidad }>();
async function resumen(periodo: Periodo = "30d"): Promise<ResumenPublicidad> {
  const g = guardado.get(periodo);
  if (g && Date.now() - g.en < 2 * 60 * 1000) return g.r;
  const r = await resumenPublicidad(TENANT, rangoDe(periodo));
  guardado.set(periodo, { en: Date.now(), r });
  return r;
}

const redondo = (n: number | null, d = 0) => (n == null ? null : Math.round(n * 10 ** d) / 10 ** d);
const texto = (x: unknown) => ({ content: [{ type: "text" as const, text: typeof x === "string" ? x : JSON.stringify(x, null, 1) }] });
const error = (msg: string) => ({ content: [{ type: "text" as const, text: msg }], isError: true });

function anuncioCompacto(a: FilaAnuncio) {
  return {
    id: a.id,
    titulo: a.titulo,
    estado: a.estado,
    publicaciones: a.publicaciones.map((p) => p.mla),
    gasto: redondo(a.gasto),
    ventas: redondo(a.ventas),
    unidades: a.unidades,
    clics: a.clics,
    impresiones: a.impresiones,
    roas: redondo(a.roas, 2),
    precio: redondo(a.costo?.precio ?? null),
    costo: redondo(a.costo?.costo ?? null),
    fuente_costo: a.costo?.fuente ?? null,
    ganancia_por_venta_antes_de_publicidad: redondo(a.costo?.ganancia ?? null),
    roas_minimo: redondo(a.costo?.roasMinimo ?? null, 2),
    ganancia_estimada: redondo(a.gananciaEstimada),
    alertas: a.alertas.map((x) => x.texto),
  };
}

const servidor = new McpServer({ name: "publicidad-ml", version: "1.0.0" }, { instructions: INSTRUCCIONES });

servidor.registerTool(
  "resumen_publicidad",
  {
    title: "Resumen de la publicidad",
    description: "Totales del período y cada campaña con gasto, ventas, ROAS, ROAS mínimo, ganancia estimada, presupuesto, ROAS objetivo, estrategia y alertas.",
    inputSchema: { periodo: PERIODO },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ periodo }) => {
    const r = await resumen(periodo);
    if (!r.disponible) return error(r.motivo);
    return texto({
      rango: r.rango,
      totales_sendero: {
        gasto: redondo(r.totales.gasto),
        ventas: redondo(r.totales.ventas),
        roas: redondo(r.totales.roas, 2),
        ganancia_estimada: redondo(r.totales.gananciaEstimada),
        cobertura: redondo(r.totales.cobertura, 2),
      },
      shay: { gasto: redondo(r.shay.gasto), ventas: redondo(r.shay.ventas) },
      roas_que_asumen_los_precios: redondo(r.roasQueAsumeElPrecio, 2),
      campanas: r.campanas.map((c) => ({
        id: c.id,
        nombre: c.nombre,
        estado: c.estado,
        es_shay: c.esShay,
        estrategia: c.estrategia,
        presupuesto_diario: c.presupuesto,
        roas_objetivo: c.roasObjetivo,
        gasto: redondo(c.gasto),
        ventas: redondo(c.ventas),
        unidades: c.unidades,
        roas: redondo(c.roas, 2),
        roas_minimo: redondo(c.roasMinimo, 2),
        ganancia_estimada: redondo(c.gananciaEstimada),
        cobertura: redondo(c.cobertura, 2),
        perdido_por_presupuesto: redondo(c.perdidoPorPresupuesto, 2),
        perdido_por_ranking: redondo(c.perdidoPorRanking, 2),
        ultimo_cambio: c.ultimoCambio,
        anuncios: c.anuncios.length,
        alertas: c.alertas.map((x) => x.texto),
      })),
      publicaciones_sin_campana: r.sinCampana.filter((a) => a.publicaciones.length).length,
    });
  }
);

servidor.registerTool(
  "anuncios_de_campana",
  {
    title: "Anuncios de una campaña",
    description: "Los anuncios de una campaña con sus métricas, precio, costo, ROAS mínimo, ganancia estimada y alertas.",
    inputSchema: { campana_id: z.number().int().describe("id de la campaña (de resumen_publicidad)"), periodo: PERIODO },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ campana_id, periodo }) => {
    const r = await resumen(periodo);
    if (!r.disponible) return error(r.motivo);
    const c = r.campanas.find((x) => x.id === campana_id);
    if (!c) return error(`No hay una campaña ${campana_id}. Las que hay: ${r.campanas.map((x) => `${x.id} (${x.nombre})`).join(", ")}.`);
    return texto({ campana: c.nombre, anuncios: c.anuncios.map(anuncioCompacto) });
  }
);

servidor.registerTool(
  "publicaciones_sin_campana",
  {
    title: "Publicaciones sin campaña",
    description: "Publicaciones que conoce el ERP y no están en ninguna campaña, con su margen y ROAS mínimo. Se agregan con cambiar_anuncio y campana_id.",
    inputSchema: { periodo: PERIODO },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ periodo }) => {
    const r = await resumen(periodo);
    if (!r.disponible) return error(r.motivo);
    return texto(r.sinCampana.filter((a) => a.publicaciones.length).map(anuncioCompacto));
  }
);

servidor.registerTool(
  "historial_cambios",
  {
    title: "Historial de cambios",
    description: "Los últimos cambios hechos en la publicidad, desde la pantalla del ERP o desde Claude.",
    inputSchema: { limite: z.number().int().min(1).max(200).optional() },
    annotations: { readOnlyHint: true },
  },
  async ({ limite }) => texto(await historialPublicidad(TENANT, limite ?? 30))
);

async function cambiar(pedido: PedidoDeCambio, aplicar: boolean | undefined, confirmadoAparte: boolean | undefined) {
  if (!aplicar) {
    const v = await vistaPreviaDeCambio(TENANT, pedido);
    return texto({ vista_previa: v, nota: "No se cambió nada. Para aplicarlo, la misma llamada con aplicar=true, con el OK de Agustín." });
  }
  const r = await aplicarCambio(TENANT, pedido, { origen: "claude", usuario: "claude (MCP local)", confirmadoAparte: !!confirmadoAparte });
  guardado.clear();
  return r.estado === "aplicado" ? texto({ estado: "aplicado", cambios: r.vista.cambios }) : error(`${r.estado}: ${r.motivo}`);
}

servidor.registerTool(
  "cambiar_campana",
  {
    title: "Cambiar una campaña",
    description:
      "Cambia presupuesto diario, ROAS objetivo, estrategia o estado de una campaña. Sin aplicar=true devuelve la vista previa y no toca nada.",
    inputSchema: {
      campana_id: z.number().int(),
      presupuesto_diario: z.number().positive().optional().describe("En pesos, por día"),
      roas_objetivo: z.number().min(1).max(35).optional(),
      estrategia: z.enum(["profitability", "increase", "visibility"]).optional().describe("rentabilidad, crecimiento o visibilidad"),
      estado: z.enum(["active", "paused"]).optional(),
      aplicar: z.boolean().optional().describe("true = mandarlo a ML. Sólo con el OK de Agustín."),
      confirmado_aparte: z.boolean().optional().describe("Para un presupuesto que cambia más de 50 % o una campaña de Shay."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async ({ campana_id, presupuesto_diario, roas_objetivo, estrategia, estado, aplicar, confirmado_aparte }) =>
    cambiar(
      {
        tipo: "campana",
        id: campana_id,
        cambios: { budget: presupuesto_diario, roas_target: roas_objetivo, strategy: estrategia, status: estado },
      },
      aplicar,
      confirmado_aparte
    )
);

servidor.registerTool(
  "cambiar_anuncio",
  {
    title: "Cambiar un anuncio",
    description:
      "Pausa o activa un anuncio, o lo pasa a otra campaña (también sirve para agregar una publicación sin campaña). Sin aplicar=true devuelve la vista previa.",
    inputSchema: {
      anuncio_id: z.number().int().describe("id del anuncio (ad group), de anuncios_de_campana o publicaciones_sin_campana"),
      estado: z.enum(["active", "paused"]).optional(),
      campana_id: z.number().int().optional().describe("La campaña a la que pasa"),
      aplicar: z.boolean().optional(),
      confirmado_aparte: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async ({ anuncio_id, estado, campana_id, aplicar, confirmado_aparte }) =>
    cambiar({ tipo: "anuncio", id: anuncio_id, cambios: { status: estado, campaign_id: campana_id } }, aplicar, confirmado_aparte)
);

async function main() {
  await servidor.connect(new StdioServerTransport());
  const cerrar = async () => {
    await prisma.$disconnect().catch(() => null);
    process.exit(0);
  };
  process.on("SIGINT", cerrar);
  process.on("SIGTERM", cerrar);
}

main().catch((e) => {
  // stdout es del protocolo: los errores van por stderr.
  console.error(e);
  process.exit(1);
});
