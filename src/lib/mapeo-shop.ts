import type { Prisma, PrismaClient } from "@/generated/prisma";
import { costoModelo, costoVariante } from "@/lib/costos";
import { normalizeForMatch } from "@/lib/webhook-security";

/**
 * Qué se vendió en el Shop según la lógica de antes del mapeo por canal: el
 * modelo por SKU o por nombre, y las opciones por nombre (docs/sdd/001, spec 004).
 *
 * La usan el webhook del Shop, cuando una clave no está mapeada, y la siembra del
 * mapeo desde el catálogo del Shop. Sólo propone: decide `resolverLinea`.
 */

type Db = PrismaClient | Prisma.TransactionClient;

/** Lo que hace falta de una línea del Shop para deducir qué es. */
export interface LineaShop {
  sku?: string | null;
  nombre_producto: string;
  opciones_seleccionadas: Array<{ grupo?: string; nombre: string; precio_extra?: number }>;
}

/**
 * Encuentra el modelo del tamaño elegido cuando la Shop pega contra uno partido.
 *
 * Las katanas se separaron en un modelo por tamaño (`… 65cm`, `… 95cm`, con SKU
 * `<sku>-65` y `<sku>-95`), pero la Shop las sigue vendiendo con un solo
 * producto que conserva el SKU viejo y ofrece el tamaño como opción. Sin esto
 * la venta entra contra el modelo inactivo, que no tiene filas de stock ni
 * recetas: no reserva la katana, no descuenta la funda, y lo único que asoma es
 * un aviso suelto de que no está definida cuál funda lleva.
 *
 * Son 16 los modelos viejos que todavía tienen SKU y la Shop puede pegar, así
 * que no alcanzaba con arreglar el pedido a mano. Deja de hacer falta cuando las
 * claves del Shop de katanas estén mapeadas (spec 004, RN-7).
 *
 * Devuelve también qué opción definió el tamaño: el modelo nuevo ya *es* ese
 * tamaño, así que buscarla entre sus variantes sólo daría un falso 'sin match'.
 */
export async function resolverModeloPorTamano(
  tx: Db,
  tenantId: string,
  modelo: { id: string; nombre: string; sku: string | null; activo: boolean },
  opciones: Array<{ nombre: string }>
): Promise<{ modeloId: string | null; opcionTamano: string | null }> {
  // Un modelo activo es el destino, no el origen: no hay nada que redirigir.
  if (modelo.activo) return { modeloId: null, opcionTamano: null };

  for (const op of opciones) {
    const medida = /^\s*(\d{2,3})\s*cm\s*$/i.exec(op.nombre)?.[1];
    if (!medida) continue;

    const porSku = modelo.sku
      ? await tx.modelo.findFirst({
          where: { tenantId, sku: `${modelo.sku}-${medida}`, activo: true, consolidadoEnId: null },
          select: { id: true },
        })
      : null;

    // Por nombre como respaldo: al partirlos quedaron como “<viejo> <medida>cm”,
    // y un SKU se puede haber cargado distinto.
    const destino =
      porSku ??
      (await tx.modelo.findFirst({
        where: {
          tenantId,
          activo: true,
          consolidadoEnId: null,
          nombre: { equals: `${modelo.nombre} ${medida}cm`, mode: "insensitive" },
        },
        select: { id: true },
      }));

    if (destino) return { modeloId: destino.id, opcionTamano: op.nombre };
  }
  return { modeloId: null, opcionTamano: null };
}

/**
 * Lo que deduce la lógica de antes del mapeo para una línea del Shop: el modelo
 * por SKU o por nombre exacto, el modelo del tamaño si es una katana partida, y
 * las opciones buscadas por nombre entre sus variantes.
 *
 * Ahora sólo propone (docs/sdd/001, spec 004, RN-4): si no hay avisos, la clave
 * queda mapeada sola; si los hay, va a la cola y la línea entra con esto. A
 * diferencia de ML, una opción que no es variante siempre es una duda: en el
 * Shop puede ser un pack de 10 o un diseño que es otra pieza (RN-8).
 */
export async function deducirLineaShop(
  tx: Db,
  tenantId: string,
  item: LineaShop
): Promise<{
  modelo: { id: string; nombre: string } | null;
  variantes: string[];
  variantesInfo: Prisma.InputJsonValue;
  costoUnitario: number;
  avisos: string[];
}> {
  // Buscar modelo por SKU
  let modelo = null;
  if (item.sku) {
    modelo = await tx.modelo.findFirst({
      where: { tenantId, sku: item.sku, consolidadoEnId: null },
      include: { variantes: true },
    });
  }
  // Fallback: buscar por nombre exacto (case-insensitive), excluyendo consolidados
  if (!modelo) {
    modelo = await tx.modelo.findFirst({
      where: {
        tenantId,
        consolidadoEnId: null,
        nombre: { equals: item.nombre_producto, mode: "insensitive" },
      },
      include: { variantes: true },
    });
  }
  if (!modelo) return { modelo: null, variantes: [], variantesInfo: [], costoUnitario: 0, avisos: [] };

  // El SKU puede ser el de un modelo partido por tamaño. No se avisa: la
  // redirección es el comportamiento correcto, y marcar cada katana de la
  // Shop para revisión manual sería ruido, no información.
  const porTamano = await resolverModeloPorTamano(tx, tenantId, modelo, item.opciones_seleccionadas);
  if (porTamano.modeloId) {
    const nuevo = await tx.modelo.findFirst({
      where: { id: porTamano.modeloId },
      include: { variantes: true },
    });
    if (nuevo) modelo = nuevo;
  }

  // Mapear variantes seleccionadas a las variantes cargadas en el inventario
  const variantesMatched: Array<{
    nombre: string;
    shopGrupo?: string;
    precioExtra: number;
    matched: boolean;
    varianteId?: string;
    costoFabAdicional?: number;
    /** El tamaño que definió cuál modelo es: no es una variante de éste. */
    absorbidaEnElModelo?: boolean;
  }> = [];
  const variantes: string[] = [];
  const avisos: string[] = [];

  let costoExtraVariantes = 0;
  for (const opcion of item.opciones_seleccionadas) {
    // El tamaño ya quedó absorbido en la identidad del modelo. Se guarda
    // para el registro de lo que eligió el comprador, sin `varianteId`:
    // así no entra en el reparto de stock ni suma costo dos veces.
    if (porTamano.opcionTamano && opcion.nombre === porTamano.opcionTamano) {
      variantesMatched.push({
        nombre: opcion.nombre,
        shopGrupo: opcion.grupo,
        precioExtra: opcion.precio_extra ?? 0,
        matched: true,
        absorbidaEnElModelo: true,
      });
      continue;
    }

    const target = normalizeForMatch(opcion.nombre);
    const match = modelo.variantes.find(
      (v) => normalizeForMatch(v.nombre) === target
    );
    if (match) {
      variantesMatched.push({
        nombre: match.nombre,
        shopGrupo: opcion.grupo,
        precioExtra: opcion.precio_extra ?? 0,
        matched: true,
        varianteId: match.id,
        costoFabAdicional: match.costoFabAdicional,
      });
      variantes.push(match.id);
      costoExtraVariantes += costoVariante(match);
    } else {
      variantesMatched.push({
        nombre: opcion.nombre,
        shopGrupo: opcion.grupo,
        precioExtra: opcion.precio_extra ?? 0,
        matched: false,
      });
      avisos.push(
        `Variante sin match en "${modelo.nombre}": "${opcion.nombre}"${
          opcion.grupo ? ` (${opcion.grupo})` : ""
        }`
      );
    }
  }

  return {
    modelo: { id: modelo.id, nombre: modelo.nombre },
    variantes,
    variantesInfo: variantesMatched as unknown as Prisma.InputJsonValue,
    costoUnitario: costoModelo(modelo) + costoExtraVariantes,
    avisos,
  };
}
