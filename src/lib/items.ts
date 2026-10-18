/**
 * Cómo se llama una línea de pedido en pantalla.
 *
 * Casi siempre es el modelo. Las líneas sin modelo —un trabajo a medida del
 * Shop, o un producto que no coincidió con el catálogo— se muestran con su
 * descripción, que ya dice cuál de las dos es ("A medida: …", "Sin modelo: …").
 */
export function nombreDeItem(item: {
  modelo?: { nombre: string } | null;
  descripcion?: string | null;
}): string {
  return item.modelo?.nombre ?? (item.descripcion?.trim() || "Pieza a medida");
}
