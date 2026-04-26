export interface TariffResult {
  eurPerKwh: number;
  source: "tavily-live" | "fallback";
  query: string;
  latencyMs: number;
  cachedAt?: string;
}

interface CachedTariff {
  result: TariffResult;
  expiresAt: number;
  cachedAt: string;
}

interface TavilySearchResult {
  title?: string;
  content?: string;
  url?: string;
}

interface TavilyResponse {
  results?: TavilySearchResult[];
  answer?: string;
}

const FALLBACK_EUR_PER_KWH = 0.32;
const CACHE_TTL_MS = 60 * 60 * 1000;
const TARIFF_MIN = 0.2;
const TARIFF_MAX = 0.5;

const cache = new Map<string, CachedTariff>();

function cacheKey(opts: { lat: number; lng: number; postcode?: string }): string {
  if (opts.postcode) return `plz:${opts.postcode}`;
  return `geo:${opts.lat.toFixed(2)},${opts.lng.toFixed(2)}`;
}

function buildQuery(opts: { postcode?: string; city?: string }): string {
  const place = [opts.city, opts.postcode].filter(Boolean).join(" ");
  return `average residential electricity tariff EUR per kWh ${place} 2025`.trim();
}

function fallback(query: string, startedAt: number, cachedAt?: string): TariffResult {
  return {
    eurPerKwh: FALLBACK_EUR_PER_KWH,
    source: "fallback",
    query,
    latencyMs: Date.now() - startedAt,
    ...(cachedAt ? { cachedAt } : {}),
  };
}

function normalizeTariff(raw: string): number | null {
  const normalized = raw
    .replace(/€/g, " EUR ")
    .replace(/kWh/gi, " kWh ")
    .replace(/,/g, ".");

  const matches = normalized.matchAll(/(?:EUR\s*)?(\d+(?:\.\d+)?)\s*(?:EUR|euro|ct|cent|cents)?\s*(?:\/|per)?\s*kWh/gi);
  for (const match of matches) {
    const numeric = Number(match[1]);
    if (!Number.isFinite(numeric)) continue;
    const eur = numeric > 1 ? numeric / 100 : numeric;
    if (eur >= TARIFF_MIN && eur <= TARIFF_MAX) return Math.round(eur * 1000) / 1000;
  }

  const looseMatches = normalized.matchAll(/\b(\d+(?:\.\d+)?)\b/g);
  for (const match of looseMatches) {
    const numeric = Number(match[1]);
    if (!Number.isFinite(numeric)) continue;
    const eur = numeric > 1 ? numeric / 100 : numeric;
    if (eur >= TARIFF_MIN && eur <= TARIFF_MAX) return Math.round(eur * 1000) / 1000;
  }

  return null;
}

function parseTariff(data: TavilyResponse): number | null {
  const haystack = [
    data.answer,
    ...(data.results ?? []).flatMap((result) => [
      result.title,
      result.content,
      result.url,
    ]),
  ]
    .filter(Boolean)
    .join("\n");

  return normalizeTariff(haystack);
}

export async function getResidentialTariff(opts: {
  lat: number;
  lng: number;
  postcode?: string;
  city?: string;
}): Promise<TariffResult> {
  const startedAt = Date.now();
  const query = buildQuery(opts);
  const key = cacheKey(opts);
  const cached = cache.get(key);

  if (cached && cached.expiresAt > Date.now()) {
    return {
      ...cached.result,
      latencyMs: Date.now() - startedAt,
      cachedAt: cached.cachedAt,
    };
  }

  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    const result = fallback(query, startedAt);
    cache.set(key, {
      result,
      expiresAt: Date.now() + CACHE_TTL_MS,
      cachedAt: new Date().toISOString(),
    });
    return result;
  }

  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "basic",
        max_results: 3,
      }),
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });

    if (!res.ok) {
      const result = fallback(query, startedAt);
      cache.set(key, {
        result,
        expiresAt: Date.now() + CACHE_TTL_MS,
        cachedAt: new Date().toISOString(),
      });
      return result;
    }

    const data = (await res.json()) as TavilyResponse;
    const parsed = parseTariff(data);
    const result: TariffResult = parsed
      ? {
          eurPerKwh: parsed,
          source: "tavily-live",
          query,
          latencyMs: Date.now() - startedAt,
        }
      : fallback(query, startedAt);

    cache.set(key, {
      result,
      expiresAt: Date.now() + CACHE_TTL_MS,
      cachedAt: new Date().toISOString(),
    });
    return result;
  } catch {
    const result = fallback(query, startedAt);
    cache.set(key, {
      result,
      expiresAt: Date.now() + CACHE_TTL_MS,
      cachedAt: new Date().toISOString(),
    });
    return result;
  }
}
