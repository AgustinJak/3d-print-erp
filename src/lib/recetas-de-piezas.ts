import { prisma } from "@/lib/prisma";
import { aplicarCostosSiCambio } from "@/lib/sincronizar-costos";

/**
 * La receta de cada pieza de Bodega (gramos, tiempo, material e insumos) se edita en el ERP desde
 * el 2026-11-16 (docs/sdd/014, spec 003, REQ-7). Vive en `bodega.models`, como siempre: el costo
 * sale de ahí (SDD 004, spec 007) y la Bodega 2.38 la baja en vez de subirla.
 */

export interface RecetaDePieza {
  nombre: string;
  gramos: number | null;
  segundos: number | null;
  materialId: string | null;
  /** Lo que se le agrega por unidad (imanes, cadena), en pesos. */
  insumos: number | null;
}

export interface MaterialDeBodega {
  id: string;
  nombre: string;
  precioKg: number;
  porDefecto: boolean;
}

const TENANT_DE_BODEGA = "sendero3d";

export async function recetasDePiezas(tenantId: string, ids: string[]): Promise<Record<string, RecetaDePieza>> {
  if (tenantId !== TENANT_DE_BODEGA || ids.length === 0) return {};
  const filas = await prisma.$queryRaw<Array<{ id: string; name: string; filament_grams: number | null; print_time_seconds: number | null; material_id: string | null; insumos: unknown }>>`
    SELECT id, name, filament_grams, print_time_seconds, material_id, insumos FROM bodega.models WHERE id = ANY(${ids})`;
  return Object.fromEntries(
    filas.map((f) => [
      f.id,
      {
        nombre: f.name,
        gramos: f.filament_grams,
        segundos: f.print_time_seconds,
        materialId: f.material_id,
        insumos: f.insumos == null ? null : Number(f.insumos),
      },
    ])
  );
}

export async function materialesDeBodega(): Promise<MaterialDeBodega[]> {
  const filas = await prisma.$queryRaw<Array<{ id: string; nombre: string; precio_kg: unknown; por_defecto: boolean }>>`
    SELECT id, nombre, precio_kg, por_defecto FROM bodega.materials WHERE activo ORDER BY por_defecto DESC, nombre`;
  return filas.map((m) => ({ id: m.id, nombre: m.nombre, precioKg: Number(m.precio_kg), porDefecto: m.por_defecto }));
}

const numeroONulo = (v: unknown, max: number): number | null | "mal" => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : "mal";
};

/**
 * Guarda la receta y recalcula los costos de los productos que usan la pieza. Sólo cambia lo que
 * viene en el pedido.
 */
export async function guardarRecetaDePieza(
  tenantId: string,
  id: string,
  c: { gramos?: unknown; segundos?: unknown; materialId?: unknown; insumos?: unknown }
): Promise<{ ok: true } | { error: string }> {
  if (tenantId !== TENANT_DE_BODEGA) return { error: "Las piezas son de Bodega, que es de Sendero 3D" };
  const [actual] = await prisma.$queryRaw<Array<{ filament_grams: number | null; print_time_seconds: number | null; material_id: string | null; insumos: unknown }>>`
    SELECT filament_grams, print_time_seconds, material_id, insumos FROM bodega.models WHERE id = ${id}`;
  if (!actual) return { error: "No existe esa pieza" };

  const gramos = "gramos" in c ? numeroONulo(c.gramos, 100_000) : actual.filament_grams;
  const segundos = "segundos" in c ? numeroONulo(c.segundos, 30 * 24 * 3600) : actual.print_time_seconds;
  const insumos = "insumos" in c ? numeroONulo(c.insumos, 10_000_000) : actual.insumos == null ? null : Number(actual.insumos);
  if (gramos === "mal") return { error: "Los gramos tienen que ser un número positivo" };
  if (segundos === "mal") return { error: "El tiempo no es válido" };
  if (insumos === "mal") return { error: "Los insumos tienen que ser un monto positivo" };

  let materialId = actual.material_id;
  if ("materialId" in c) {
    materialId = typeof c.materialId === "string" && c.materialId ? c.materialId : null;
    if (materialId) {
      const [m] = await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM bodega.materials WHERE id = ${materialId}`;
      if (!m) return { error: "Ese material no existe" };
    }
  }

  await prisma.$executeRaw`
    UPDATE bodega.models
       SET filament_grams = ${gramos}, print_time_seconds = ${segundos == null ? null : Math.round(segundos)},
           material_id = ${materialId}, insumos = ${insumos}, updated_at = now()
     WHERE id = ${id}`;
  await aplicarCostosSiCambio(tenantId).catch((e) => console.error("[recetas-de-piezas] costos:", e));
  return { ok: true };
}
