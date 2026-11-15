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

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * Las variantes de una línea, para mostrar al lado del nombre ("Con Funda", "Verde (Metalizado)").
 * Las de ML que no coincidieron con el catálogo a veces repiten el nombre del producto ("Tokito" en
 * la Tokito Katana, "K4os" en el vaso K4os): ésas no se muestran. Sin repetidas.
 */
export function variantesDeItem(item: {
  modelo?: { nombre: string } | null;
  variantesInfo?: Array<{ nombre?: string | null }> | null;
}): string[] {
  const producto = sinAcentos(item.modelo?.nombre ?? "");
  const vistas = new Set<string>();
  const out: string[] = [];
  for (const v of item.variantesInfo ?? []) {
    const nombre = v.nombre?.trim();
    if (!nombre) continue;
    const clave = sinAcentos(nombre);
    if (vistas.has(clave) || (producto && producto.includes(clave))) continue;
    vistas.add(clave);
    out.push(nombre);
  }
  return out;
}

/** El nombre con sus variantes: "Tomioka Katana 95cm · Con Funda". */
export function nombreConVariantes(item: Parameters<typeof nombreDeItem>[0] & Parameters<typeof variantesDeItem>[0]): string {
  return [nombreDeItem(item), ...variantesDeItem(item)].join(" · ");
}
