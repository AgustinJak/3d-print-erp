import { prisma } from "@/lib/prisma";

/**
 * Las piezas de Bodega que usan los productos activos y los insumos, con lo que les falta
 * (archivo, receta) y cuánto se vendieron, para completarlas empezando por lo que más se vende
 * (docs/sdd/014, pedido de Agustín del 2026-11-16: al 2026-11-16, 86 de 142 sin receta y 61 sin
 * archivo).
 *
 * Las ventas son unidades de los últimos 90 días, sin cancelados:
 * - una pieza de un producto sin variantes de pieza cuenta todo lo vendido del producto;
 * - una opción ("Producto · Opción") cuenta lo vendido de las combinaciones que la incluyen;
 * - un insumo (la funda) cuenta lo que lo descontaron sus recetas.
 */

export interface PiezaACompletar {
  /** El id de la pieza en bodega.models. */
  id: string;
  nombre: string;
  /** La fila de stock: "Producto · Opción". */
  etiqueta: string | null;
  modeloId: string;
  producto: string;
  esInsumo: boolean;
  vendidas: number;
  tieneArchivo: boolean;
  tieneReceta: boolean;
}

const DIAS = 90;

export async function piezasACompletar(tenantId: string): Promise<PiezaACompletar[]> {
  if (tenantId !== "sendero3d") return []; // Bodega es de un solo negocio
  const filas = await prisma.$queryRaw<
    Array<{
      id: string;
      nombre: string;
      etiqueta: string | null;
      modelo_id: string;
      producto: string;
      es_insumo: boolean;
      vendidas: number | null;
      tiene_archivo: boolean;
      tiene_receta: boolean;
    }>
  >`
    WITH ventas AS (
      SELECT ip.modelo_id, ip.combinacion_id, ip.cantidad
        FROM public.items_pedido ip
        JOIN public.pedidos p ON p.id = ip.pedido_id
       WHERE p.tenant_id = ${tenantId}
         AND p.estado <> 'CANCELADO'
         AND p.fecha_pedido >= now() - make_interval(days => ${DIAS}::int)
         AND ip.modelo_id IS NOT NULL
    ),
    piezas AS (
      SELECT s.id AS stock_id, s.bodega_model_id, s.etiqueta, s.variantes, m.id AS modelo_id, m.nombre AS producto, m.es_insumo
        FROM public.stock s
        JOIN public.modelos m ON m.id = s.modelo_id
       WHERE s.tenant_id = ${tenantId}
         AND s.bodega_model_id IS NOT NULL
         AND m.consolidado_en_id IS NULL
         AND (m.activo OR m.es_insumo)
    )
    SELECT b.id, b.name AS nombre, pz.etiqueta, pz.modelo_id, pz.producto, pz.es_insumo,
           CASE
             WHEN pz.es_insumo THEN (
               SELECT COALESCE(SUM(v.cantidad * r.cantidad), 0)
                 FROM public.reglas_insumo r
                 JOIN public.combinaciones c ON c.modelo_id = r.modelo_id AND r.requiere <@ c.variantes
                 JOIN ventas v ON v.combinacion_id = c.id
                WHERE r.stock_id = pz.stock_id)
             WHEN cardinality(pz.variantes) = 0 THEN (
               SELECT COALESCE(SUM(v.cantidad), 0) FROM ventas v WHERE v.modelo_id = pz.modelo_id)
             ELSE (
               SELECT COALESCE(SUM(v.cantidad), 0)
                 FROM ventas v JOIN public.combinaciones c ON c.id = v.combinacion_id
                WHERE c.modelo_id = pz.modelo_id AND pz.variantes <@ c.variantes)
           END::int AS vendidas,
           EXISTS (SELECT 1 FROM public.piezas_archivo pa JOIN public.archivos_3d a ON a.id = pa.archivo_id
                    WHERE pa.bodega_model_id = b.id AND a.subido) AS tiene_archivo,
           (b.filament_grams IS NOT NULL AND b.print_time_seconds IS NOT NULL) AS tiene_receta
      FROM piezas pz
      JOIN bodega.models b ON b.id = pz.bodega_model_id`;

  return filas
    .map((f) => ({
      id: f.id,
      nombre: f.nombre,
      etiqueta: f.etiqueta,
      modeloId: f.modelo_id,
      producto: f.producto,
      esInsumo: f.es_insumo,
      vendidas: Number(f.vendidas ?? 0),
      tieneArchivo: f.tiene_archivo,
      tieneReceta: f.tiene_receta,
    }))
    .sort((a, b) => b.vendidas - a.vendidas || (a.etiqueta ?? a.nombre).localeCompare(b.etiqueta ?? b.nombre, "es"));
}
