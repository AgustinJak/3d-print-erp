/**
 * Las reglas de las tareas del día (docs/sdd/012), sin base ni red, para que las usen la pantalla
 * y el servidor y se puedan probar.
 */

export const ESTADOS_TAREA = ["por_hacer", "haciendo", "trabada", "terminada"] as const;
export type EstadoTarea = (typeof ESTADOS_TAREA)[number];
export const PRIORIDADES_TAREA = ["baja", "normal", "alta"] as const;
export type PrioridadTarea = (typeof PRIORIDADES_TAREA)[number];
export type Frecuencia = "diaria" | "semanal" | "mensual";

const ZONA = "America/Argentina/Buenos_Aires";

/** El día en Argentina de un instante, "YYYY-MM-DD". */
export function diaDe(fecha: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" }).format(fecha);
}

/** El instante en que empieza un día de Argentina (UTC−3, sin horario de verano). */
export function inicioDelDia(dia: string): Date {
  return new Date(`${dia}T00:00:00-03:00`);
}

/** El día siguiente, "YYYY-MM-DD". */
export function diaSiguiente(dia: string): string {
  return new Date(new Date(`${dia}T12:00:00Z`).getTime() + 864e5).toISOString().slice(0, 10);
}

/** Si una tarea que se repite tiene que aparecer ese día. Mensual en un día que el mes no tiene (31) → el último. */
export function tocaElDia(r: { frecuencia: Frecuencia | string; dias: number[] }, dia: string): boolean {
  const d = new Date(`${dia}T12:00:00Z`);
  if (r.frecuencia === "diaria") return true;
  if (r.frecuencia === "semanal") return r.dias.includes(d.getUTCDay());
  if (r.frecuencia === "mensual") {
    const delMes = d.getUTCDate();
    const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    return r.dias.some((x) => x === delMes || (x > ultimo && delMes === ultimo));
  }
  return false;
}

/** Qué columna muestra una tarea en el tablero de hoy: las terminadas sólo si se terminaron hoy. */
export function vaEnElTablero(t: { estado: string; terminadaEn: Date | string | null }, hoy: string): boolean {
  if (t.estado !== "terminada") return true;
  return !!t.terminadaEn && diaDe(new Date(t.terminadaEn)) === hoy;
}

/** El orden para poner una tarea entre dos (o al principio / al final de una columna). */
export function ordenEntre(antes: number | null, despues: number | null): number {
  if (antes == null && despues == null) return 1000;
  if (antes == null) return despues! - 1000;
  if (despues == null) return antes + 1000;
  return (antes + despues) / 2;
}

/** Cuántos días lleva abierta una tarea (para el aviso "desde hace 3 días"). */
export function diasAbierta(creadaEn: Date | string, hoy: string): number {
  const desde = diaDe(new Date(creadaEn));
  return Math.round((new Date(`${hoy}T12:00:00Z`).getTime() - new Date(`${desde}T12:00:00Z`).getTime()) / 864e5);
}

const NOMBRE_DIA = ["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"];

/** "Todos los días", "Los lunes y jueves", "El 8 de cada mes". */
export function textoDeFrecuencia(r: { frecuencia: Frecuencia | string; dias: number[] }): string {
  const lista = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);
  if (r.frecuencia === "diaria") return "Todos los días";
  if (r.frecuencia === "semanal") {
    const ds = [...r.dias].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    return ds.length ? `Los ${lista(ds.map((d) => NOMBRE_DIA[d]))}` : "Ningún día";
  }
  const ds = [...r.dias].sort((a, b) => a - b);
  return ds.length ? `El ${lista(ds.map(String))} de cada mes` : "Ningún día";
}

/** Formato de un tamaño de archivo: "12,4 MB". */
export function tamanoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const u = ["KB", "MB", "GB"];
  let n = bytes / 1024;
  let i = 0;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toLocaleString("es-AR", { maximumFractionDigits: n < 10 ? 1 : 0 })} ${u[i]}`;
}

/** Los formatos que el visor 3D sabe mostrar. */
export const SE_VE_EN_3D = new Set(["stl", "3mf", "obj"]);

export function extensionDe(nombre: string): string {
  const m = nombre.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}
