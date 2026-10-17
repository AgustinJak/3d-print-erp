import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * La URL de la base con un límite de tiempo por consulta.
 *
 * El 2026-10-16 la base se colgó de una forma particular: el pooler aceptaba la conexión y
 * la consulta quedaba esperando. Así Prisma espera indefinidamente —medido: más de 40 s— y
 * `connect_timeout` / `pool_timeout` no cortan nada, porque la conexión ya está hecha.
 * `socket_timeout` sí: la consulta falla con P1008 y la ruta puede contestar 503.
 *
 * 15 s y no menos: con la base recién reiniciada, una consulta legítima tardó 11 s. Se agrega
 * sólo si la URL no lo trae, para no pisar lo que esté configurado en Vercel.
 */
function conLimitePorConsulta(url: string | undefined): string | undefined {
  if (!url || /[?&]socket_timeout=/.test(url)) return url;
  return url + (url.includes("?") ? "&" : "?") + "socket_timeout=15";
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ datasourceUrl: conLimitePorConsulta(process.env.DATABASE_URL) });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
