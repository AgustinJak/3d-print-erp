/**
 * ¿Este error quiere decir que la base no responde?
 *
 * Sirve para contestar 503 con un motivo claro en vez de un 500 vacío. El 2026-10-16 la base
 * se colgó y el cron de Mercado Libre devolvió 500 sin cuerpo: el aviso de GitHub decía sólo
 * "HTTP 500" y no había forma de saber si era un bug o la base. Ver el SDD de Bodega
 * `docs/sdd/001-calculadora-y-sincronizacion`, spec 006.
 *
 * Se reconoce por código de Prisma y, por las dudas, por el texto: el error del pooler de
 * Supabase ("authentication did not complete within 15000ms") llega envuelto como error
 * genérico de consulta.
 */
const CODIGOS = new Set([
  "P1001", // no se puede llegar al servidor
  "P1002", // el servidor no contestó a tiempo al conectar
  "P1008", // la consulta no tuvo respuesta dentro de socket_timeout
  "P1017", // el servidor cerró la conexión
  "P2024", // no hubo conexión libre en el pool a tiempo
]);

const TEXTOS = [
  /Can't reach database server/i,
  /Socket timeout/i,
  /Failed to connect to database/i,
  /authentication did not complete/i,
  /Server has closed the connection/i,
  /Timed out fetching a new connection/i,
];

export function esBaseCaida(e: unknown): boolean {
  const err = e as { code?: unknown; errorCode?: unknown; message?: unknown } | null;
  if (!err) return false;
  if (typeof err.code === "string" && CODIGOS.has(err.code)) return true;
  if (typeof err.errorCode === "string" && CODIGOS.has(err.errorCode)) return true;
  const msg = typeof err.message === "string" ? err.message : "";
  return TEXTOS.some((r) => r.test(msg));
}

export const MENSAJE_BASE_CAIDA = "base de datos no responde";
