import { NextRequest, NextResponse } from "next/server";
import { searchSTLModels } from "@/lib/stl-search";

/**
 * GET /api/tendencias/stl-search?q=mario+bros&limit=6
 * Busca modelos STL relacionados a un keyword en Printables + Thingiverse
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q");
  const limit = Math.min(parseInt(searchParams.get("limit") || "6"), 12);

  if (!query || query.trim().length < 2) {
    return NextResponse.json(
      { error: "Query 'q' es requerido (mínimo 2 caracteres)" },
      { status: 400 }
    );
  }

  try {
    const results = await searchSTLModels(query.trim(), limit);
    return NextResponse.json(results);
  } catch (error) {
    console.error("Error en STL search:", error);
    return NextResponse.json(
      { error: "Error buscando modelos STL" },
      { status: 500 }
    );
  }
}
