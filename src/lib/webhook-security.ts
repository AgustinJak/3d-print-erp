import { createHmac, timingSafeEqual } from "crypto";

/**
 * Valida la firma HMAC-SHA256 de un webhook entrante.
 *
 * El emisor debe firmar `${timestamp}.${rawBody}` con el secret compartido.
 * Esto previene:
 *  - Manipulación del payload (cambia firma)
 *  - Replay attacks (timestamp viejo se rechaza)
 *  - Falsificación sin secret
 */
export interface WebhookValidation {
  valid: boolean;
  reason?: string;
}

const TIMESTAMP_TOLERANCE_SECONDS = 5 * 60; // 5 minutos

export function computeSignature(
  secret: string,
  timestamp: string,
  rawBody: string
): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
}

export function verifyWebhookSignature(
  secret: string,
  signatureHeader: string | null,
  timestampHeader: string | null,
  rawBody: string
): WebhookValidation {
  if (!signatureHeader) return { valid: false, reason: "missing_signature" };
  if (!timestampHeader) return { valid: false, reason: "missing_timestamp" };

  const ts = parseInt(timestampHeader, 10);
  if (Number.isNaN(ts)) return { valid: false, reason: "invalid_timestamp" };

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > TIMESTAMP_TOLERANCE_SECONDS) {
    return { valid: false, reason: "timestamp_out_of_tolerance" };
  }

  const expected = computeSignature(secret, timestampHeader, rawBody);

  // timingSafeEqual previene side-channel attacks por longitud
  const a = Buffer.from(expected, "utf-8");
  const b = Buffer.from(signatureHeader, "utf-8");
  if (a.length !== b.length) return { valid: false, reason: "signature_mismatch" };
  if (!timingSafeEqual(a, b)) return { valid: false, reason: "signature_mismatch" };

  return { valid: true };
}

/**
 * Normaliza un string para comparación tolerante de variantes.
 * "Con Funda" === "con funda" === "Con  Funda" === "Con-Funda"
 */
export function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita acentos (combining diacritics)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
