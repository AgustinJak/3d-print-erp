const TMDB_API_KEY = process.env.TMDB_API_KEY;
const BASE_URL = "https://api.themoviedb.org/3";

export interface TMDBMovie {
  id: number;
  title: string;
  original_language: string;
  overview: string;
  release_date: string;
  poster_path: string | null;
  popularity: number;
  genre_ids: number[];
}

export interface TMDBSeries {
  id: number;
  name: string;
  original_language: string;
  overview: string;
  first_air_date: string;
  poster_path: string | null;
  popularity: number;
  genre_ids: number[];
}

interface TMDBResponse<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

// TMDB genre IDs
const GENRE_ACTION = [28, 10759]; // Movie: 28, TV: 10759
const GENRE_HORROR = [27];
const GENRE_SCIFI = [878, 10765]; // Movie: 878, TV: 10765
const GENRE_KIDS = [16, 10751, 10762]; // Animation, Family, Kids
const GENRE_ADVENTURE = [12];

// Idiomas relevantes para Argentina (inglés, español, japonés para anime)
const RELEVANT_LANGUAGES = new Set(["en", "es", "ja"]);

// Popularidad mínima para que valga la pena traerlo
const MIN_POPULARITY = 20;

/**
 * Franquicias conocidas que tienen boost automático de viralidad.
 * Si el título contiene alguna de estas keywords, se le sube el nivel viral.
 */
const FRANCHISE_BOOST_KEYWORDS = [
  "mario", "marvel", "avengers", "spider-man", "batman", "superman", "dc",
  "star wars", "disney", "pixar", "harry potter", "jurassic", "fast & furious",
  "rapidos y furiosos", "transformers", "toy story", "frozen", "shrek",
  "mission impossible", "mision imposible", "john wick", "avatar",
  "lord of the rings", "señor de los anillos", "indiana jones",
  "deadpool", "wolverine", "x-men", "guardians", "guardianes",
  "minecraft", "sonic", "pokemon", "zelda", "dragon ball",
  "one piece", "naruto", "demon slayer", "attack on titan",
];

/**
 * Nivel viral basado en popularidad de TMDB + boost por franquicia.
 * TMDB popularity para películas por estrenar varía mucho:
 * - Blockbusters confirmados: ~50-300 (pre-release)
 * - Películas conocidas: ~20-50
 * - Nicho: ~5-20
 * Nota: la popularidad de TMDB para estrenos futuros es MUCHO menor que para
 * películas ya estrenadas (que pueden llegar a 500-2000+).
 */
function getViralLevel(popularity: number, title: string): string {
  // Boost si es franquicia reconocida
  const titleLower = title.toLowerCase();
  const isFranchise = FRANCHISE_BOOST_KEYWORDS.some((kw) => titleLower.includes(kw));

  if (isFranchise) {
    // Franquicias conocidas: mínimo "alto", si tiene buena popularidad → explosivo
    if (popularity > 100) return "explosivo";
    if (popularity > 30) return "alto";
    return "alto"; // franquicia siempre al menos alto
  }

  // No-franquicia: escala normal para pre-release
  if (popularity > 200) return "explosivo";
  if (popularity > 80) return "alto";
  if (popularity > 35) return "medio";
  return "bajo";
}

function getImageUrl(posterPath: string | null): string | null {
  if (!posterPath) return null;
  return `https://image.tmdb.org/t/p/w500${posterPath}`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return new Date().toISOString();
  return new Date(dateStr).toISOString();
}

async function tmdbFetch<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  if (!TMDB_API_KEY) {
    throw new Error("TMDB_API_KEY no configurada");
  }

  const searchParams = new URLSearchParams({
    api_key: TMDB_API_KEY,
    ...params,
  });

  const url = `${BASE_URL}${endpoint}?${searchParams.toString()}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`TMDB API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Filtra contenido que NO es relevante para Argentina:
 * - Descarta idiomas que no son inglés, español o japonés
 * - Descarta contenido con popularidad muy baja (a menos que sea franquicia)
 */
function isRelevantForArgentina(item: { original_language: string; popularity: number; title?: string; name?: string }): boolean {
  if (!RELEVANT_LANGUAGES.has(item.original_language)) return false;

  const title = (item.title || item.name || "").toLowerCase();
  const isFranchise = FRANCHISE_BOOST_KEYWORDS.some((kw) => title.includes(kw));

  // Franquicias siempre pasan
  if (isFranchise) return true;

  if (item.popularity < MIN_POPULARITY) return false;
  return true;
}

/**
 * Fetch upcoming movies (next 90 days, sorted by popularity, filtered for AR relevance)
 */
export async function fetchUpcomingMovies(): Promise<TMDBMovie[]> {
  const today = new Date();
  const futureDate = new Date();
  futureDate.setDate(today.getDate() + 90);

  const gteDate = today.toISOString().split("T")[0];
  const lteDate = futureDate.toISOString().split("T")[0];

  const allMovies: TMDBMovie[] = [];

  // Sin region=AR (muy restrictivo). Usamos language=es-AR para traducciones
  // y filtramos por original_language después
  for (let page = 1; page <= 3; page++) {
    try {
      const data = await tmdbFetch<TMDBResponse<TMDBMovie>>("/discover/movie", {
        language: "es-AR",
        sort_by: "popularity.desc",
        "primary_release_date.gte": gteDate,
        "primary_release_date.lte": lteDate,
        page: String(page),
      });
      allMovies.push(...data.results);
      if (page >= data.total_pages) break;
    } catch {
      break;
    }
  }

  // Filtrar solo contenido relevante para Argentina
  return allMovies.filter(isRelevantForArgentina);
}

/**
 * Fetch upcoming TV series (next 90 days, filtered for Argentina relevance)
 */
export async function fetchUpcomingSeries(): Promise<TMDBSeries[]> {
  const today = new Date();
  const futureDate = new Date();
  futureDate.setDate(today.getDate() + 90);

  const gteDate = today.toISOString().split("T")[0];
  const lteDate = futureDate.toISOString().split("T")[0];

  const allSeries: TMDBSeries[] = [];

  for (let page = 1; page <= 3; page++) {
    try {
      const data = await tmdbFetch<TMDBResponse<TMDBSeries>>("/discover/tv", {
        language: "es-AR",
        sort_by: "popularity.desc",
        "first_air_date.gte": gteDate,
        "first_air_date.lte": lteDate,
        page: String(page),
      });
      allSeries.push(...data.results);
      if (page >= data.total_pages) break;
    } catch {
      break;
    }
  }

  // Filtrar solo contenido relevante para Argentina
  return allSeries.filter((s) =>
    isRelevantForArgentina({ ...s, title: s.name })
  );
}

/**
 * Generate product suggestions based on genre IDs
 */
function generateSugerencias(genreIds: number[]): Array<{
  nombre: string;
  tipoProducto: string;
  potencialVenta: number;
  dificultad: string;
  ventanaInicio: string;
}> {
  const sugerencias: Array<{
    nombre: string;
    tipoProducto: string;
    potencialVenta: number;
    dificultad: string;
    ventanaInicio: string;
  }> = [];

  const hasGenre = (ids: number[]) => genreIds.some((g) => ids.includes(g));

  if (hasGenre(GENRE_KIDS)) {
    sugerencias.push({
      nombre: "Juguete/figura temática",
      tipoProducto: "replica",
      potencialVenta: 3,
      dificultad: "media",
      ventanaInicio: "2-3 semanas antes del estreno",
    });
  } else if (hasGenre(GENRE_HORROR)) {
    sugerencias.push({
      nombre: "Máscara/decoración temática",
      tipoProducto: "decoracion",
      potencialVenta: 2,
      dificultad: "media",
      ventanaInicio: "2-3 semanas antes del estreno",
    });
  } else if (hasGenre(GENRE_SCIFI)) {
    sugerencias.push({
      nombre: "Accesorio futurista",
      tipoProducto: "accesorio",
      potencialVenta: 2,
      dificultad: "media",
      ventanaInicio: "2-3 semanas antes del estreno",
    });
  } else if (hasGenre([...GENRE_ACTION, ...GENRE_ADVENTURE])) {
    sugerencias.push({
      nombre: "Réplica de prop icónico",
      tipoProducto: "replica",
      potencialVenta: 2,
      dificultad: "media",
      ventanaInicio: "2-3 semanas antes del estreno",
    });
  } else {
    sugerencias.push({
      nombre: "Merchandising temático",
      tipoProducto: "accesorio",
      potencialVenta: 1,
      dificultad: "baja",
      ventanaInicio: "2-3 semanas antes del estreno",
    });
  }

  return sugerencias;
}

/**
 * Convert TMDB movie to EventoTendencia upsert data
 */
export function tmdbMovieToEvento(movie: TMDBMovie) {
  return {
    titulo: movie.title,
    tipo: "pelicula",
    fecha: new Date(formatDate(movie.release_date)),
    descripcion: movie.overview || null,
    imagenUrl: getImageUrl(movie.poster_path),
    nivelViral: getViralLevel(movie.popularity, movie.title),
    fuente: "tmdb",
    fuenteId: `tmdb-movie-${movie.id}`,
    sugerencias: generateSugerencias(movie.genre_ids),
  };
}

/**
 * Convert TMDB series to EventoTendencia upsert data
 */
export function tmdbSeriesToEvento(series: TMDBSeries) {
  return {
    titulo: series.name,
    tipo: "serie",
    fecha: new Date(formatDate(series.first_air_date)),
    descripcion: series.overview || null,
    imagenUrl: getImageUrl(series.poster_path),
    nivelViral: getViralLevel(series.popularity, series.name),
    fuente: "tmdb",
    fuenteId: `tmdb-tv-${series.id}`,
    sugerencias: generateSugerencias(series.genre_ids),
  };
}
