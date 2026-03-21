/**
 * Buscador de modelos STL en marketplaces 3D.
 * Fuentes: Printables (sin auth), Thingiverse (con key), MyMiniFactory (con key), Cults3D (con key)
 */

export interface STLModel {
  id: string;
  name: string;
  author: string;
  imageUrl: string | null;
  url: string;
  source: "printables" | "thingiverse" | "myminifactory" | "cults3d";
  likes?: number;
  downloads?: number;
}

// ─── PRINTABLES (GraphQL, sin auth) ────────────────────────────────

const PRINTABLES_GQL = "https://api.printables.com/graphql/";

const PRINTABLES_SEARCH_QUERY = `
  query SearchModels($query: String!, $limit: Int!) {
    result: searchPrints2(query: $query, limit: $limit) {
      items {
        id
        name
        slug
        user { publicUsername }
        image { filePath }
        likesCount
        downloadCount
      }
    }
  }
`;

export async function searchPrintables(query: string, limit = 6): Promise<STLModel[]> {
  try {
    const response = await fetch(PRINTABLES_GQL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: PRINTABLES_SEARCH_QUERY,
        variables: { query, limit },
      }),
    });

    if (!response.ok) {
      console.warn(`Printables API error: ${response.status}`);
      return [];
    }

    const json = await response.json();
    const items = json?.data?.result?.items || [];

    return items.map((item: any) => ({
      id: `printables-${item.id}`,
      name: item.name || "Sin nombre",
      author: item.user?.publicUsername || "Desconocido",
      imageUrl: item.image?.filePath
        ? `https://media.printables.com/${item.image.filePath}`
        : null,
      url: `https://www.printables.com/model/${item.id}-${item.slug || ""}`,
      source: "printables" as const,
      likes: item.likesCount || 0,
      downloads: item.downloadCount || 0,
    }));
  } catch (error) {
    console.warn("Error buscando en Printables:", error);
    return [];
  }
}

// ─── THINGIVERSE (REST, con API key) ───────────────────────────────

const THINGIVERSE_API = "https://api.thingiverse.com";
const THINGIVERSE_KEY = process.env.THINGIVERSE_API_KEY;

export async function searchThingiverse(query: string, limit = 6): Promise<STLModel[]> {
  if (!THINGIVERSE_KEY) return [];

  try {
    const params = new URLSearchParams({
      type: "things",
      per_page: String(limit),
      access_token: THINGIVERSE_KEY,
    });

    const response = await fetch(
      `${THINGIVERSE_API}/search/${encodeURIComponent(query)}/?${params}`
    );

    if (!response.ok) {
      console.warn(`Thingiverse API error: ${response.status}`);
      return [];
    }

    const json = await response.json();
    const hits = json?.hits || json || [];

    return (Array.isArray(hits) ? hits : []).slice(0, limit).map((item: any) => ({
      id: `thingiverse-${item.id}`,
      name: item.name || "Sin nombre",
      author: item.creator?.name || item.creator?.first_name || "Desconocido",
      imageUrl: item.thumbnail || null,
      url: item.public_url || `https://www.thingiverse.com/thing:${item.id}`,
      source: "thingiverse" as const,
      likes: item.like_count || 0,
      downloads: item.download_count || 0,
    }));
  } catch (error) {
    console.warn("Error buscando en Thingiverse:", error);
    return [];
  }
}

// ─── CULTS3D (GraphQL, con API key) ────────────────────────────────

const CULTS3D_GQL = "https://cults3d.com/graphql";
const CULTS3D_KEY = process.env.CULTS3D_API_KEY;

const CULTS3D_SEARCH_QUERY = `
  query SearchCreations($query: String!, $limit: Int!) {
    creationsSearchBatch(query: $query, limit: $limit) {
      total
      creations {
        name(locale: ES)
        shortUrl
        creator { nick }
        illustrationImageUrl
        likesCount
      }
    }
  }
`;

export async function searchCults3D(query: string, limit = 6): Promise<STLModel[]> {
  if (!CULTS3D_KEY) return [];

  try {
    const response = await fetch(CULTS3D_GQL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Basic " + Buffer.from(`${CULTS3D_KEY}:`).toString("base64"),
      },
      body: JSON.stringify({
        query: CULTS3D_SEARCH_QUERY,
        variables: { query, limit },
      }),
    });

    if (!response.ok) {
      console.warn(`Cults3D API error: ${response.status}`);
      return [];
    }

    const json = await response.json();
    const creations = json?.data?.creationsSearchBatch?.creations || [];

    return creations.map((item: any, idx: number) => ({
      id: `cults3d-${idx}-${item.shortUrl || ""}`,
      name: item.name || "Sin nombre",
      author: item.creator?.nick || "Desconocido",
      imageUrl: item.illustrationImageUrl || null,
      url: item.shortUrl
        ? `https://cults3d.com${item.shortUrl}`
        : "https://cults3d.com",
      source: "cults3d" as const,
      likes: item.likesCount || 0,
    }));
  } catch (error) {
    console.warn("Error buscando en Cults3D:", error);
    return [];
  }
}

// ─── MYMINIFACTORY (REST, con API key) ─────────────────────────────

const MMF_API = "https://www.myminifactory.com/api/v2";
const MMF_KEY = process.env.MYMINIFACTORY_API_KEY;

export async function searchMyMiniFactory(query: string, limit = 6): Promise<STLModel[]> {
  if (!MMF_KEY) return [];

  try {
    const params = new URLSearchParams({
      q: query,
      key: MMF_KEY,
      per_page: String(limit),
    });

    const response = await fetch(`${MMF_API}/search?${params}`);

    if (!response.ok) {
      console.warn(`MyMiniFactory API error: ${response.status}`);
      return [];
    }

    const json = await response.json();
    const items = json?.items || json?.objects || [];

    return (Array.isArray(items) ? items : []).slice(0, limit).map((item: any) => ({
      id: `mmf-${item.id}`,
      name: item.name || "Sin nombre",
      author: item.designer?.username || item.designer?.name || "Desconocido",
      imageUrl: item.images?.[0]?.thumbnail?.url || item.images?.[0]?.standard?.url || null,
      url: item.url || `https://www.myminifactory.com/object/${item.id}`,
      source: "myminifactory" as const,
      likes: item.likes || 0,
      downloads: item.views || 0,
    }));
  } catch (error) {
    console.warn("Error buscando en MyMiniFactory:", error);
    return [];
  }
}

// ─── BÚSQUEDA COMBINADA ────────────────────────────────────────────

/**
 * Busca modelos STL en todas las fuentes disponibles.
 * Retorna resultados combinados de todas las fuentes.
 */
export async function searchSTLModels(query: string, limit = 6): Promise<STLModel[]> {
  const results = await Promise.allSettled([
    searchPrintables(query, limit),
    searchThingiverse(query, limit),
    searchCults3D(query, limit),
    searchMyMiniFactory(query, limit),
  ]);

  const combined: STLModel[] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      combined.push(...result.value);
    }
  }

  return combined;
}
