/**
 * Las fechas comerciales de Argentina, con su regla (docs/sdd/016, RN-4). Se calculan, no se
 * cargan: hasta el 2026-11-20 eran filas de 2026 sembradas a mano y 2027 no existía.
 */

export interface FechaComercial {
  clave: string;
  titulo: string;
  /** Cuántos días antes conviene tener el producto listo. */
  anticipacion: number;
  fecha: (anio: number) => Date;
}

/** Medianoche UTC del día: así se guardan las fechas de eventos (ver `diasHasta`). */
const dia = (anio: number, mes: number, d: number) => new Date(Date.UTC(anio, mes - 1, d));

/** El n-ésimo día de la semana del mes (0 = domingo). n = 3 → el tercero. */
function enesimo(anio: number, mes: number, diaSemana: number, n: number): Date {
  const primero = dia(anio, mes, 1);
  const corrimiento = (diaSemana - primero.getUTCDay() + 7) % 7;
  return dia(anio, mes, 1 + corrimiento + (n - 1) * 7);
}

/** Domingo de Pascua (algoritmo de Meeus, calendario gregoriano). */
function pascua(anio: number): Date {
  const a = anio % 19, b = Math.floor(anio / 100), c = anio % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), d2 = ((h + l - 7 * m + 114) % 31) + 1;
  return dia(anio, mes, d2);
}

export const FECHAS_COMERCIALES: FechaComercial[] = [
  { clave: "reyes", titulo: "Reyes Magos", anticipacion: 21, fecha: (a) => dia(a, 1, 6) },
  { clave: "san-valentin", titulo: "San Valentín", anticipacion: 21, fecha: (a) => dia(a, 2, 14) },
  { clave: "vuelta-a-clases", titulo: "Vuelta a clases", anticipacion: 21, fecha: (a) => dia(a, 3, 1) },
  { clave: "pascuas", titulo: "Pascuas", anticipacion: 14, fecha: pascua },
  { clave: "dia-del-padre", titulo: "Día del Padre", anticipacion: 30, fecha: (a) => enesimo(a, 6, 0, 3) },
  { clave: "dia-del-amigo", titulo: "Día del Amigo", anticipacion: 21, fecha: (a) => dia(a, 7, 20) },
  { clave: "dia-del-nino", titulo: "Día del Niño", anticipacion: 30, fecha: (a) => enesimo(a, 8, 0, 3) },
  { clave: "primavera", titulo: "Día de la Primavera y del Estudiante", anticipacion: 14, fecha: (a) => dia(a, 9, 21) },
  { clave: "dia-de-la-madre", titulo: "Día de la Madre", anticipacion: 30, fecha: (a) => enesimo(a, 10, 0, 3) },
  { clave: "halloween", titulo: "Halloween", anticipacion: 30, fecha: (a) => dia(a, 10, 31) },
  // El viernes después del cuarto jueves de noviembre.
  { clave: "black-friday", titulo: "Black Friday", anticipacion: 21, fecha: (a) => new Date(enesimo(a, 11, 4, 4).getTime() + 24 * 60 * 60 * 1000) },
  { clave: "navidad", titulo: "Navidad", anticipacion: 30, fecha: (a) => dia(a, 12, 25) },
  { clave: "fin-de-anio", titulo: "Fin de año", anticipacion: 21, fecha: (a) => dia(a, 12, 31) },
];

export interface ProximaFecha {
  clave: string;
  titulo: string;
  fecha: Date;
  anticipacion: number;
}

/**
 * La próxima ocurrencia de cada fecha desde `desde` (incluido el mismo día), dentro de `dias`.
 * Ordenadas por fecha.
 */
export function proximasFechasComerciales(desde: Date, dias = 365): ProximaFecha[] {
  const hoy = Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), desde.getUTCDate());
  const hasta = hoy + dias * 24 * 60 * 60 * 1000;
  const out: ProximaFecha[] = [];
  for (const f of FECHAS_COMERCIALES) {
    const anio = desde.getUTCFullYear();
    const proxima = [f.fecha(anio), f.fecha(anio + 1)].find((d) => d.getTime() >= hoy);
    if (proxima && proxima.getTime() <= hasta) out.push({ clave: f.clave, titulo: f.titulo, fecha: proxima, anticipacion: f.anticipacion });
  }
  return out.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
}
