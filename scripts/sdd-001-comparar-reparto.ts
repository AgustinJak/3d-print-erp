/**
 * docs/sdd/001, spec 002 CA-3 — el reparto por combinación da lo mismo que el de antes.
 *
 *   npx tsx --env-file=.env scripts/sdd-001-comparar-reparto.ts
 *
 * Saca una foto de las reservas y de lo que falta imprimir (las armó el reparto de
 * producción, que lee el JSON), reparte con este código (que lee la combinación) y
 * compara. Sólo tiene sentido si el stock no se movió desde el último reparto: lo
 * chequea antes y si no, avisa y no reparte.
 */
import { prisma } from "@/lib/prisma";
import { reasignarReservas } from "@/lib/reservas";

const T = "sendero3d";

async function foto() {
  const reservas = await prisma.reservaStock.findMany({
    where: { tenantId: T, estado: "RESERVADA" },
    select: { pedidoId: true, itemId: true, stockId: true, cantidad: true, tipo: true },
  });
  const pendiente = await prisma.produccionPendiente.findMany({
    where: { tenantId: T },
    select: { stockId: true, unidades: true, pedidos: true },
  });
  return {
    reservas: reservas.map((r) => `${r.pedidoId}|${r.itemId}|${r.stockId}|${r.cantidad}|${r.tipo}`).sort(),
    pendiente: pendiente.map((p) => `${p.stockId}|${p.unidades}|${p.pedidos}`).sort(),
  };
}

async function main() {
  const [estado] = await prisma.$queryRaw<Array<{ stock: Date | null; marca: string | null }>>`
    SELECT (SELECT max(updated_at) FROM public.stock WHERE tenant_id = ${T}) AS stock,
           (SELECT data->>'ultimoReparto' FROM public.config_tenant WHERE tenant_id = ${T}) AS marca`;
  if (!estado.marca || (estado.stock && new Date(estado.marca) < estado.stock)) {
    console.log("El stock se movió desde el último reparto: la foto no sirve de referencia. No se reparte.");
    return;
  }
  const antes = await foto();
  const r = await reasignarReservas(T);
  const despues = await foto();
  const igual = (a: string[], b: string[]) => a.join("\n") === b.join("\n");
  console.log(`Reparto nuevo: ${r.pedidos} pedidos, ${r.reservas} reservas, ${r.unidades} unidades, ${r.faltantes.length} faltantes`);
  console.log(`${igual(antes.reservas, despues.reservas) ? "✔" : "✘"} reservas idénticas (${antes.reservas.length} → ${despues.reservas.length})`);
  console.log(`${igual(antes.pendiente, despues.pendiente) ? "✔" : "✘"} "Faltan" idéntico (${antes.pendiente.length} → ${despues.pendiente.length})`);
  if (!igual(antes.reservas, despues.reservas)) {
    const a = new Set(antes.reservas), b = new Set(despues.reservas);
    console.log("  sólo antes:", antes.reservas.filter((x) => !b.has(x)));
    console.log("  sólo después:", despues.reservas.filter((x) => !a.has(x)));
  }
}

main().finally(() => prisma.$disconnect());
