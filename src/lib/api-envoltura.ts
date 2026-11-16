import { NextResponse } from "next/server";

/**
 * Envuelve un handler de la API: devuelve el NextResponse que tire la autenticación, y cualquier
 * otro error como { error } con 500.
 */
export async function responder(fn: () => Promise<unknown>) {
  try {
    const r = await fn();
    return r instanceof NextResponse ? r : NextResponse.json(r);
  } catch (e) {
    if (e instanceof NextResponse) return e;
    return NextResponse.json({ error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}

export const noEncontrado = () => NextResponse.json({ error: "No encontrado" }, { status: 404 });
export const malPedido = (error: string) => NextResponse.json({ error }, { status: 400 });
