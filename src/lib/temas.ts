/**
 * Temas de Tendencias (docs/sdd/016): normalizar textos, ver si una búsqueda o un título es de un
 * tema, y las señales que ordenan la lista. Puro, sin base: lo usan el servidor, los scripts y la
 * pantalla.
 */

export const TIPOS_DE_TEMA = ["anime", "pelicula", "serie", "kpop", "musica", "juego", "personaje", "deporte", "producto", "otro"] as const;
export type TipoDeTema = (typeof TIPOS_DE_TEMA)[number];

export const ETIQUETA_DE_TIPO: Record<TipoDeTema, string> = {
  anime: "Anime",
  pelicula: "Película",
  serie: "Serie",
  kpop: "K-pop",
  musica: "Música",
  juego: "Videojuego",
  personaje: "Personaje",
  deporte: "Deporte",
  producto: "Tipo de producto",
  otro: "Otro",
};

/**
 * Minúsculas, sin tildes ni signos, con los espacios colapsados. Los guiones entre letras se
 * pegan ("k-pop" → "kpop", "spider-man" → "spiderman"), que es como se escribe en las búsquedas.
 */
export function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/(\p{L})[-‐](?=\p{L})/gu, "$1")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Un alias corto coincide de más ("one" en cualquier lado): menos de 3 letras no cuenta. */
export const ALIAS_MINIMO = 3;

/** Si el alias aparece como palabra entera (o palabras seguidas) dentro del texto. Ambos normalizados. */
export function coincide(texto: string, alias: string): boolean {
  if (alias.length < ALIAS_MINIMO) return false;
  return ` ${texto} `.includes(` ${alias} `);
}

export interface TemaParaCoincidir {
  id: string;
  alias: string[];
}

/** El tema al que pertenece un texto (una búsqueda o un título): el de alias más largo que coincide. */
export function temaDeTexto<T extends TemaParaCoincidir>(texto: string, temas: T[]): T | null {
  const n = normalizar(texto);
  let mejor: { tema: T; largo: number } | null = null;
  for (const t of temas) {
    for (const a of t.alias) {
      if (coincide(n, a) && (!mejor || a.length > mejor.largo)) mejor = { tema: t, largo: a.length };
    }
  }
  return mejor?.tema ?? null;
}

/**
 * Búsquedas que suben pero no son un tema: épocas del año, marcas de tecnología, comodines. No
 * van a "Búsquedas nuevas". Normalizadas.
 */
export const BUSQUEDAS_GENERICAS = new Set([
  "ofertas", "oferta", "navidad", "buscar", "notebook", "celular", "celulares", "iphone", "samsung", "motorola",
  "xiaomi", "zapatillas", "aire acondicionado", "ventilador", "regalos", "regalo", "juguetes", "juguetes ninos",
  "juegos", "juego", "black friday", "cyber monday", "hot sale", "envio gratis", "usado", "usados",
]);

/** Si una búsqueda es genérica: está en la lista, es sólo números, o es una sola palabra de menos de 4 letras. */
export function esGenerica(normalizada: string): boolean {
  return BUSQUEDAS_GENERICAS.has(normalizada) || /^[\d ]+$/.test(normalizada) || (!normalizada.includes(" ") && normalizada.length < 4);
}

// ─── Señales ──────────────────────────────────────────────────────────────

export interface BusquedaDeTema {
  palabra: string;
  categoriaId: string;
  categoria: string | null;
  posicion: number;
  /** No estaba en la foto de hace 7 días. */
  nueva: boolean;
}

export interface EventoDeTema {
  titulo: string;
  tipo: string;
  /** ISO: la de Argentina si la hay; si no, la mundial. */
  fecha: string;
  enArgentina: boolean;
}

export interface DatosDeTema {
  busquedas: BusquedaDeTema[];
  eventos: EventoDeTema[];
  ventas: { ultimos30: number; anteriores30: number };
  productos: number;
}

export interface Senal {
  clave: "ml" | "nueva" | "evento" | "ventas" | "baja" | "sin-producto";
  peso: number;
  texto: string;
  /** accion = pide atención; aviso = algo que baja; quieto = dato. */
  tono: "accion" | "aviso" | "quieto";
}

export interface Lectura {
  senales: Senal[];
  puntaje: number;
  /** Hay señal de afuera (ML o un evento) y no tenés producto del tema. */
  oportunidad: boolean;
}

/** El sitio entero pesa la mitad: ahí suben cosas que no son del rubro. */
export const CATEGORIA_SITIO = "MLA";

const DIA = 24 * 60 * 60 * 1000;

function pesoDePosicion(posicion: number): number {
  return posicion <= 10 ? 3 : posicion <= 25 ? 2 : posicion <= 50 ? 1 : 0;
}

function verboDeEvento(tipo: string): string {
  return tipo === "pelicula" || tipo === "serie" ? "estreno" : tipo === "anime" ? "empieza" : tipo === "concierto" ? "recital" : "";
}

/** El día de hoy en Buenos Aires, como "AAAA-MM-DD": el servidor corre en UTC. */
export function hoyEnArgentina(ahora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format(ahora);
}

/**
 * Cuántos días faltan (hoy = 0). Las fechas de eventos son días de calendario guardados a la
 * medianoche UTC ("2026-12-02T00:00:00Z" es el 2 de diciembre), así que se toma su fecha UTC; leída
 * en hora argentina caería el día anterior.
 */
export function diasHasta(fechaIso: string, hoy = new Date()): number {
  const [y, m, d] = hoyEnArgentina(hoy).split("-").map(Number);
  const a = Date.UTC(y, m - 1, d);
  const f = new Date(fechaIso);
  const b = Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate());
  return Math.round((b - a) / DIA);
}

const cuando = (dias: number) => (dias === 0 ? "hoy" : dias === 1 ? "mañana" : `en ${dias} días`);

/**
 * Las señales de un tema y su puntaje (RN-1: el orden se explica). Pesos en el SDD técnico,
 * sección 4.
 */
export function leerTema(d: DatosDeTema, hoy = new Date()): Lectura {
  const senales: Senal[] = [];

  // Mercado Libre: la mejor posición, con el sitio entero a la mitad.
  const conPeso = d.busquedas
    .map((b) => ({ b, peso: pesoDePosicion(b.posicion) / (b.categoriaId === CATEGORIA_SITIO ? 2 : 1) }))
    .sort((x, y) => y.peso - x.peso || x.b.posicion - y.b.posicion);
  const mejor = conPeso[0];
  if (mejor && mejor.peso > 0) {
    const donde = mejor.b.categoriaId === CATEGORIA_SITIO ? "en todo ML" : `en ${mejor.b.categoria ?? mejor.b.categoriaId}`;
    senales.push({ clave: "ml", peso: mejor.peso, texto: `#${mejor.b.posicion} ${donde}: «${mejor.b.palabra}»`, tono: "accion" });
    if (d.busquedas.some((b) => b.nueva)) senales.push({ clave: "nueva", peso: 1, texto: "nueva esta semana en ML", tono: "accion" });
  }

  // El próximo evento dentro de 90 días.
  const proximo = d.eventos
    .map((e) => ({ e, dias: diasHasta(e.fecha, hoy) }))
    .filter((x) => x.dias >= 0 && x.dias <= 90)
    .sort((x, y) => x.dias - y.dias)[0];
  if (proximo) {
    const peso = proximo.dias <= 21 ? 3 : proximo.dias <= 45 ? 2 : 1;
    const verbo = verboDeEvento(proximo.e.tipo);
    const texto = `${verbo ? `${verbo} ` : ""}${cuando(proximo.dias)}${proximo.e.enArgentina || !verbo ? "" : " (fecha mundial)"}`;
    senales.push({ clave: "evento", peso, texto: verbo ? texto : `${proximo.e.titulo} ${texto}`, tono: peso >= 2 ? "accion" : "quieto" });
  }

  // Tus ventas.
  const { ultimos30: u, anteriores30: a } = d.ventas;
  if (u >= 5 && u >= 1.5 * a) senales.push({ clave: "ventas", peso: 2, texto: `vendiste ${u}, antes ${a}`, tono: "accion" });
  else if (u >= 10) senales.push({ clave: "ventas", peso: 1, texto: `vende ${u} por mes`, tono: "quieto" });
  if (a >= 10 && u < 0.6 * a) senales.push({ clave: "baja", peso: 0, texto: `baja: ${u}, antes ${a}`, tono: "aviso" });

  const deAfuera = senales.some((s) => s.clave === "ml" || s.clave === "evento");
  const oportunidad = deAfuera && d.productos === 0;
  if (oportunidad) senales.push({ clave: "sin-producto", peso: 0, texto: "no tenés producto", tono: "aviso" });

  return { senales, puntaje: senales.reduce((n, s) => n + s.peso, 0), oportunidad };
}
