import type { FilaAnuncio, FilaCampana, PedidoDeCambio } from "@/lib/publicidad-ml";
import { DIAS_DE_APRENDIZAJE, GASTO_MINIMO_ALERTA, ROAS_OBJETIVO_MAX, ROAS_OBJETIVO_MIN, decimal } from "@/lib/publicidad-reglas";

/**
 * Qué conviene hacer con la publicidad (docs/sdd/005, spec 004): acciones concretas, con el valor
 * exacto, calculadas con las mismas reglas que la página. Sin IA: es lo que haría una persona
 * mirando los números con el ROAS mínimo al lado.
 *
 * Funciones puras. El resumen las calcula una vez y las muestran la página y el MCP.
 *
 * Nunca se recomienda nada sobre campañas de Shay ni sobre lo que tiene pocos datos: con 5 clics
 * cualquier conclusión es ruido, y una recomendación equivocada se aplica igual. Por lo mismo se
 * calculan siempre con los últimos 30 días (`PERIODO_RECOMENDACIONES`), aunque la pantalla muestre
 * otro período: con 7 días, un anuncio que vende bien puede pasar una semana sin vender.
 */

export const PERIODO_RECOMENDACIONES = "30d" as const;

/** Un anuncio sin ventas con menos clics que esto todavía no dice nada. */
export const CLICS_MINIMOS_ANUNCIO = 15;
/** Una campaña necesita gastar esto en el período para concluir algo de ella. */
export const GASTO_MINIMO_CAMPANA = 10000;
/** Para subir presupuesto, el ROAS tiene que superar el mínimo con este margen. */
export const HOLGURA_PARA_CRECER = 1.2;
/** El ROAS objetivo que se propone queda este tanto por encima del mínimo. */
export const MARGEN_SOBRE_EL_MINIMO = 1.25;
/** Un anuncio que vende con un ROAS por debajo de esta fracción del mínimo pierde claramente. */
export const FRACCION_PIERDE_CLARO = 0.7;
/** Publicaciones sin campaña con un ROAS mínimo hasta acá tienen margen para anunciarse. */
export const ROAS_MINIMO_BUEN_MARGEN = 3;

export interface Recomendacion {
  /** Estable entre cargas: sirve de key. */
  clave: string;
  /** true = hoy pierde plata; false = oportunidad. */
  grave: boolean;
  /** La acción, con el valor exacto. */
  titulo: string;
  /** Los números que la justifican. */
  porque: string;
  /** Lo que se cambiaría: la página abre la vista previa con lo que hay que tocar en ML. */
  pedido: PedidoDeCambio | null;
  /** O un lugar adonde ir. */
  ir: { texto: string; href: string } | { texto: string; pestana: "sin-campana" } | null;
  /** Para ordenar: cuánta plata está en juego. */
  monto: number;
}

const pesos = (n: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
const x = (n: number) => `${decimal(n)}×`;
const arribaDe100 = (n: number) => Math.ceil(n / 100) * 100;
const corto = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function cambiadaHacePoco(c: FilaCampana, ahora: Date): boolean {
  if (!c.ultimoCambio) return false;
  return (ahora.getTime() - new Date(c.ultimoCambio).getTime()) / 86_400_000 < DIAS_DE_APRENDIZAJE;
}

export function recomendaciones(
  campanas: FilaCampana[],
  sinCampana: FilaAnuncio[],
  ahora = new Date()
): Recomendacion[] {
  const out: Recomendacion[] = [];

  for (const c of campanas) {
    if (c.esShay) continue;
    const activa = c.estado === "active";

    // Anuncios que pierden plata, en campañas activas.
    for (const a of activa ? c.anuncios : []) {
      if (a.estado !== "ACTIVE") continue;
      const pedido: PedidoDeCambio = { tipo: "anuncio", id: a.id, cambios: { status: "paused" } };
      if (a.ventas === 0 && a.gasto >= GASTO_MINIMO_ALERTA && a.clics >= CLICS_MINIMOS_ANUNCIO) {
        out.push({
          clave: `pausar-anuncio-${a.id}`,
          grave: true,
          titulo: `Pausá el anuncio «${corto(a.titulo)}»`,
          porque: `Gastó ${pesos(a.gasto)} con ${a.clics} clics y ninguna venta (campaña ${c.nombre}).`,
          pedido,
          ir: null,
          monto: a.gasto,
        });
      } else if (
        a.costo?.roasMinimo != null &&
        a.roas != null &&
        a.ventas > 0 &&
        a.gasto >= GASTO_MINIMO_ALERTA &&
        a.roas < a.costo.roasMinimo * FRACCION_PIERDE_CLARO
      ) {
        out.push({
          clave: `pausar-anuncio-${a.id}`,
          grave: true,
          titulo: `Pausá el anuncio «${corto(a.titulo)}»`,
          porque: `Vende, pero con ROAS ${x(a.roas)} contra un mínimo de ${x(a.costo.roasMinimo)}: cada venta por publicidad pierde plata (${pesos(-(a.gananciaEstimada ?? 0))} en el período).`,
          pedido,
          ir: null,
          monto: Math.max(a.gasto, -(a.gananciaEstimada ?? 0)),
        });
      }
    }

    if (!activa) continue;
    const reciente = cambiadaHacePoco(c, ahora);
    const conDatos = c.gasto >= GASTO_MINIMO_CAMPANA;

    // Un ROAS objetivo debajo del mínimo le permite a ML vender a pérdida.
    if (c.roasMinimo != null && c.roasObjetivo != null && c.roasObjetivo < c.roasMinimo && !reciente) {
      const nuevo = Math.min(ROAS_OBJETIVO_MAX, Math.max(ROAS_OBJETIVO_MIN, Math.ceil(c.roasMinimo * MARGEN_SOBRE_EL_MINIMO * 10) / 10));
      out.push({
        clave: `roas-objetivo-${c.id}`,
        grave: c.roas != null && c.roas < c.roasMinimo,
        titulo: `Subí el ROAS objetivo de «${c.nombre}» de ${x(c.roasObjetivo)} a ${x(nuevo)}`,
        porque: `Con ${x(c.roasObjetivo)}, ML puede vender por debajo del mínimo para no perder (${x(c.roasMinimo)}). ${x(nuevo)} le deja un margen.`,
        pedido: { tipo: "campana", id: c.id, cambios: { roas_target: nuevo } },
        ir: null,
        monto: c.gasto,
      });
      continue;
    }

    // Pierde plata con un objetivo que ya está bien: lo que queda es gastar menos.
    if (conDatos && !reciente && c.roasMinimo != null && c.roas != null && c.roas < c.roasMinimo && (c.cobertura ?? 0) >= 0.5) {
      if (c.ventas === 0) {
        out.push({
          clave: `pausar-campana-${c.id}`,
          grave: true,
          titulo: `Pausá la campaña «${c.nombre}»`,
          porque: `Gastó ${pesos(c.gasto)} sin ventas atribuidas.`,
          pedido: { tipo: "campana", id: c.id, cambios: { status: "paused" } },
          ir: null,
          monto: c.gasto,
        });
      } else {
        const nuevo = Math.max(100, arribaDe100(c.presupuesto * 0.7));
        out.push({
          clave: `bajar-presupuesto-${c.id}`,
          grave: true,
          titulo: `Bajá el presupuesto de «${c.nombre}» de ${pesos(c.presupuesto)} a ${pesos(nuevo)} por día`,
          porque: `ROAS ${x(c.roas)} contra un mínimo de ${x(c.roasMinimo)}: pierde plata. Mirá también sus anuncios.`,
          pedido: { tipo: "campana", id: c.id, cambios: { budget: nuevo } },
          ir: null,
          monto: c.gasto,
        });
      }
      continue;
    }

    // Rinde con margen y se queda corta de presupuesto.
    const perdido = c.perdidoPorPresupuesto ?? 0;
    if (
      conDatos &&
      !reciente &&
      perdido >= 0.1 &&
      c.roasMinimo != null &&
      c.roas != null &&
      c.roas >= c.roasMinimo * HOLGURA_PARA_CRECER &&
      (c.gananciaEstimada ?? 0) > 0
    ) {
      const nuevo = arribaDe100(c.presupuesto * 1.25);
      out.push({
        clave: `subir-presupuesto-${c.id}`,
        grave: false,
        titulo: `Subí el presupuesto de «${c.nombre}» de ${pesos(c.presupuesto)} a ${pesos(nuevo)} por día`,
        porque: `Rinde (ROAS ${x(c.roas)} contra un mínimo de ${x(c.roasMinimo)}, dejó ${pesos(c.gananciaEstimada ?? 0)}) y pierde ${Math.round(perdido * 100)} % de las impresiones por falta de presupuesto. Subí de a poco y mirá en una semana.`,
        pedido: { tipo: "campana", id: c.id, cambios: { budget: nuevo } },
        ir: null,
        monto: (c.gananciaEstimada ?? 0) * perdido,
      });
    }
  }

  // Precios que no cierran: eso no lo arregla la publicidad.
  const vistos = new Set<string>();
  for (const a of [...campanas.filter((c) => !c.esShay).flatMap((c) => c.anuncios), ...sinCampana]) {
    if (!a.costo || a.costo.ganancia > 0 || vistos.has(String(a.id))) continue;
    vistos.add(String(a.id));
    out.push({
      clave: `precio-${a.id}`,
      grave: true,
      titulo: `Revisá el precio de «${corto(a.titulo)}»`,
      porque: `A ${pesos(a.costo.precio)} no deja ganancia ni sin publicidad (costo ${pesos(a.costo.costo)} más comisión, cargo fijo y envío). Si ese costo no te cierra, puede ser la receta en Bodega y no el precio.`,
      pedido: null,
      ir: a.costo.modeloId ? { texto: "Ver en Precios", href: `/precios?modelo=${a.costo.modeloId}` } : null,
      monto: a.costo.precio,
    });
  }

  // Publicaciones con buen margen que no se anuncian.
  const buenas = sinCampana.filter((a) => a.costo?.roasMinimo != null && a.costo.roasMinimo <= ROAS_MINIMO_BUEN_MARGEN);
  if (buenas.length) {
    out.push({
      clave: "sumar-publicaciones",
      grave: false,
      titulo: `Sumá a una campaña ${buenas.length === 1 ? "1 publicación" : `${buenas.length} publicaciones`} con buen margen`,
      porque: `No están en ninguna campaña y aguantan publicidad: su ROAS mínimo es ${x(ROAS_MINIMO_BUEN_MARGEN)} o menos. Por ejemplo, ${buenas
        .slice(0, 2)
        .map((a) => `«${corto(a.titulo, 40)}»`)
        .join(" y ")}.`,
      pedido: null,
      ir: { texto: "Ver cuáles", pestana: "sin-campana" },
      monto: 0,
    });
  }

  return out.sort((a, b) => Number(b.grave) - Number(a.grave) || b.monto - a.monto);
}
