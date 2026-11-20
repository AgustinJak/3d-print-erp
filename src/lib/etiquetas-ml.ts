import { unzipSync, strFromU8 } from "fflate";
import { getValidAccessToken } from "@/lib/mercadolibre";

/**
 * El ZPL de las etiquetas de envío de Mercado Libre (docs/sdd/017, spec 002), para imprimirlas desde
 * la Bodega sin bajar archivos.
 *
 * `GET /shipment_labels?shipment_ids=…&response_type=zpl2` devuelve un ZIP con un .txt (el ZPL) y a
 * veces un PDF de resumen; se toma sólo el .txt. Trae lo que la cuenta tenga configurado en ML
 * ("Imprimir troquel"). Bajarla la marca como impresa en ML, igual que en la web.
 *
 * RN-1: el ZPL tiene nombre, documento y dirección del comprador. Se devuelve y se olvida: no se
 * guarda ni se loguea, ni siquiera en un error.
 */

const TENANT = "sendero3d";
const ML_API = "https://api.mercadolibre.com";
/** ML acepta hasta 50 envíos por pedido. */
const POR_TANDA = 50;

export interface EtiquetasZpl {
  zpl: string;
  /** Cuántos envíos se pidieron y cuántos bloques de etiqueta volvieron. */
  pedidos: number;
}

export class ErrorDeEtiquetas extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

/** Los ids que vienen de afuera: sólo números, sin repetir, como mucho 200. */
export function validarIds(crudo: string | null): string[] | null {
  if (!crudo) return null;
  const ids = [...new Set(crudo.split(",").map((s) => s.trim()).filter(Boolean))];
  if (!ids.length || ids.length > 200 || !ids.every((id) => /^\d{6,20}$/.test(id))) return null;
  return ids;
}

function zplDe(bytes: Uint8Array): string {
  // ZIP: empieza con "PK". Si ML algún día manda el texto directo, también sirve.
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const archivos = unzipSync(bytes);
    const txt = Object.entries(archivos).filter(([nombre]) => /\.(txt|zpl)$/i.test(nombre));
    if (!txt.length) throw new ErrorDeEtiquetas("Mercado Libre no mandó la etiqueta en ZPL", 502);
    // latin1: ML escapa los acentos con ^FH, el resto es ASCII.
    return txt.map(([, contenido]) => strFromU8(contenido, true)).join("");
  }
  return strFromU8(bytes, true);
}

/** Pide el ZPL de esos envíos a ML, con el token de la cuenta Sendero 3D. Primero los que van primero. */
export async function etiquetasZpl(envioIds: string[]): Promise<EtiquetasZpl> {
  const token = await getValidAccessToken(TENANT);
  const partes: string[] = [];
  for (let i = 0; i < envioIds.length; i += POR_TANDA) {
    const tanda = envioIds.slice(i, i + POR_TANDA);
    const r = await fetch(`${ML_API}/shipment_labels?shipment_ids=${tanda.join(",")}&response_type=zpl2`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) {
      // El cuerpo de error de ML no trae datos del comprador, pero igual sólo se pasa el mensaje.
      const cuerpo = (await r.json().catch(() => null)) as { message?: string; error?: string } | null;
      throw new ErrorDeEtiquetas(cuerpo?.message ?? cuerpo?.error ?? `Mercado Libre contestó ${r.status}`, r.status === 401 ? 502 : r.status);
    }
    partes.push(zplDe(new Uint8Array(await r.arrayBuffer())));
  }
  return { zpl: partes.join(""), pedidos: envioIds.length };
}
