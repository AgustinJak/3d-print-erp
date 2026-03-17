const ANILIST_URL = "https://graphql.anilist.co";

type MediaSeason = "WINTER" | "SPRING" | "SUMMER" | "FALL";

export interface AniListAnime {
  id: number;
  title: {
    romaji: string;
    english: string | null;
    native: string | null;
  };
  description: string | null;
  season: MediaSeason | null;
  seasonYear: number | null;
  startDate: {
    year: number | null;
    month: number | null;
    day: number | null;
  };
  coverImage: {
    large: string | null;
  };
  popularity: number;
  genres: string[];
}

interface AniListResponse {
  data: {
    Page: {
      media: AniListAnime[];
    };
  };
}

const QUERY = `
query ($season: MediaSeason, $seasonYear: Int, $page: Int) {
  Page(page: $page, perPage: 25) {
    media(
      season: $season
      seasonYear: $seasonYear
      type: ANIME
      sort: POPULARITY_DESC
      status_in: [NOT_YET_RELEASED, RELEASING]
    ) {
      id
      title { romaji english native }
      description
      season
      seasonYear
      startDate { year month day }
      coverImage { large }
      popularity
      genres
    }
  }
}
`;

// Popularidad mínima para que un anime sea relevante en Argentina
// AniList: top anime ~200k+, conocidos ~50k-200k, nicho ~15k-50k, oscuro <15k
// Subimos a 25000 para mostrar solo anime que la gente conoce
const MIN_ANIME_POPULARITY = 25000;

/**
 * Determine the current anime season from the month
 */
function getCurrentSeason(month: number): MediaSeason {
  if (month >= 1 && month <= 3) return "WINTER";
  if (month >= 4 && month <= 6) return "SPRING";
  if (month >= 7 && month <= 9) return "SUMMER";
  return "FALL";
}

/**
 * Get the next season after the given one
 */
function getNextSeason(season: MediaSeason): { season: MediaSeason; yearOffset: number } {
  switch (season) {
    case "WINTER": return { season: "SPRING", yearOffset: 0 };
    case "SPRING": return { season: "SUMMER", yearOffset: 0 };
    case "SUMMER": return { season: "FALL", yearOffset: 0 };
    case "FALL": return { season: "WINTER", yearOffset: 1 };
  }
}

/**
 * Fetch a single page of anime for a given season
 */
async function fetchAnimeSeason(season: MediaSeason, seasonYear: number): Promise<AniListAnime[]> {
  const response = await fetch(ANILIST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: QUERY,
      variables: { season, seasonYear, page: 1 },
    }),
  });

  if (!response.ok) {
    throw new Error(`AniList API error: ${response.status} ${response.statusText}`);
  }

  const json = (await response.json()) as AniListResponse;
  return json.data.Page.media;
}

// Franquicias de anime que siempre son relevantes, sin importar popularidad
const ANIME_FRANCHISE_KEYWORDS = [
  "dragon ball", "naruto", "boruto", "one piece", "demon slayer", "kimetsu",
  "attack on titan", "shingeki", "jujutsu kaisen", "my hero academia", "boku no hero",
  "chainsaw man", "spy x family", "spy family", "bleach", "hunter x hunter",
  "fullmetal", "death note", "tokyo ghoul", "sword art online", "sao",
  "one punch man", "mob psycho", "vinland saga", "jojo", "steel ball run",
  "evangelion", "cowboy bebop", "frieren", "oshi no ko", "dandadan",
  "kaiju no. 8", "solo leveling", "blue lock", "haikyuu",
];

/**
 * Filtra anime relevante:
 * - Debe tener título en inglés o romaji legible
 * - Popularidad mínima (descarta anime ultra-nicho)
 * - Franquicias conocidas siempre pasan
 */
function isRelevantAnime(anime: AniListAnime): boolean {
  // Debe tener al menos título en inglés o romaji
  if (!anime.title.english && !anime.title.romaji) return false;

  // Franquicias conocidas siempre pasan
  const titleCheck = `${anime.title.english || ""} ${anime.title.romaji || ""}`.toLowerCase();
  const isFranchise = ANIME_FRANCHISE_KEYWORDS.some((kw) => titleCheck.includes(kw));
  if (isFranchise) return true;

  // Para el resto, aplicar mínimo de popularidad
  if (anime.popularity < MIN_ANIME_POPULARITY) return false;
  return true;
}

/**
 * Fetch upcoming anime for current and next season, filtered for relevance
 */
export async function fetchUpcomingAnime(): Promise<AniListAnime[]> {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const currentSeason = getCurrentSeason(currentMonth);
  const next = getNextSeason(currentSeason);
  const nextYear = currentYear + next.yearOffset;

  const [currentResults, nextResults] = await Promise.all([
    fetchAnimeSeason(currentSeason, currentYear).catch((err) => {
      console.warn(`Error fetching AniList temporada actual (${currentSeason} ${currentYear}):`, err);
      return [] as AniListAnime[];
    }),
    fetchAnimeSeason(next.season, nextYear).catch((err) => {
      console.warn(`Error fetching AniList próxima temporada (${next.season} ${nextYear}):`, err);
      return [] as AniListAnime[];
    }),
  ]);

  // Deduplicate by ID
  const seen = new Set<number>();
  const combined: AniListAnime[] = [];

  for (const anime of [...currentResults, ...nextResults]) {
    if (!seen.has(anime.id)) {
      seen.add(anime.id);
      combined.push(anime);
    }
  }

  // Filtrar solo anime relevante
  return combined.filter(isRelevantAnime);
}

/**
 * Nivel viral para anime.
 * AniList popularity: top tier ~200k+, popular ~50k-200k, conocido ~15k-50k
 */
function getViralLevel(popularity: number): string {
  if (popularity > 150000) return "explosivo";
  if (popularity > 70000) return "alto";
  if (popularity > 30000) return "medio";
  return "bajo";
}

/**
 * Build a Date from AniList's startDate, falling back to season start if incomplete
 */
function buildDate(startDate: AniListAnime["startDate"], season: MediaSeason | null, seasonYear: number | null): Date {
  const year = startDate.year ?? seasonYear ?? new Date().getFullYear();
  const month = startDate.month ?? getSeasonStartMonth(season);
  const day = startDate.day ?? 1;
  return new Date(year, month - 1, day);
}

function getSeasonStartMonth(season: MediaSeason | null): number {
  switch (season) {
    case "WINTER": return 1;
    case "SPRING": return 4;
    case "SUMMER": return 7;
    case "FALL": return 10;
    default: return 1;
  }
}

/**
 * Generate product suggestions based on anime genres
 */
function generateAnimeSugerencias(genres: string[]): Array<{
  nombre: string;
  tipoProducto: string;
  potencialVenta: number;
  dificultad: string;
  ventanaInicio: string;
}> {
  const lowerGenres = genres.map((g) => g.toLowerCase());

  if (lowerGenres.includes("horror")) {
    return [
      {
        nombre: "Máscara/decoración temática",
        tipoProducto: "decoracion",
        potencialVenta: 2,
        dificultad: "media",
        ventanaInicio: "2-3 semanas antes del estreno",
      },
    ];
  }

  if (lowerGenres.includes("sci-fi") || lowerGenres.includes("mecha")) {
    return [
      {
        nombre: "Accesorio futurista",
        tipoProducto: "accesorio",
        potencialVenta: 2,
        dificultad: "media",
        ventanaInicio: "2-3 semanas antes del estreno",
      },
    ];
  }

  // Default for anime: weapon/accessory replica
  return [
    {
      nombre: "Réplica de arma/accesorio",
      tipoProducto: "replica",
      potencialVenta: 2,
      dificultad: "media",
      ventanaInicio: "2-3 semanas antes del estreno",
    },
  ];
}

/**
 * Strip HTML tags from AniList descriptions
 */
function stripHtml(html: string | null): string | null {
  if (!html) return null;
  return html.replace(/<[^>]*>/g, "").trim();
}

/**
 * Convert AniList anime to EventoTendencia upsert data.
 * Prefiere título en inglés, fallback a romaji.
 */
export function anilistAnimeToEvento(anime: AniListAnime) {
  // Preferir título en inglés (más reconocible en Argentina), luego romaji
  const displayTitle = anime.title.english || anime.title.romaji || anime.title.native || "Sin título";

  return {
    titulo: displayTitle,
    tipo: "anime",
    fecha: buildDate(anime.startDate, anime.season, anime.seasonYear),
    descripcion: stripHtml(anime.description),
    imagenUrl: anime.coverImage.large,
    nivelViral: getViralLevel(anime.popularity),
    fuente: "anilist",
    fuenteId: `anilist-${anime.id}`,
    sugerencias: generateAnimeSugerencias(anime.genres),
  };
}
