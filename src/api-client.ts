import { config } from './config.js';
import { TokenBucketRateLimiter, type RateGate } from './rate-limit.js';

export type ValuationOptions = {
  cities: { slug: string; name: string }[];
  hoods: { citySlug: string; slug: string; name: string }[];
  types: { value: string; label: string }[];
};

export type PriceIndexEntry = { path: string; count: number; label: string };

export type MarketReportIndexEntry = { citySlug: string; cityName: string; months: string[] };

export type PropertyRecord = Record<string, unknown>;

export type SearchParams = {
  city?: string;
  neighborhood?: string;
  propertyType?: string;
  listingType?: string;
  priceMin?: number;
  priceMax?: number;
  areaSqmMin?: number;
  areaSqmMax?: number;
  rooms?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
};

export type SearchResponse = {
  data: PropertyRecord[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};

export type PricePageRecord = Record<string, unknown>;

export type ValuationParams = { city: string; type: string; area: string | number; hood?: string };

export class ApiClient {
  private readonly baseUrl: string;
  private readonly userAgent: string;
  private readonly timeoutMs: number;
  private readonly limiter: RateGate;

  constructor(
    opts: { baseUrl?: string; userAgent?: string; timeoutMs?: number; limiter?: RateGate } = {},
  ) {
    this.baseUrl = (opts.baseUrl ?? config.apiUrl).replace(/\/+$/, '');
    this.userAgent = opts.userAgent ?? config.userAgent;
    this.timeoutMs = opts.timeoutMs ?? config.httpTimeoutMs;
    this.limiter =
      opts.limiter ?? new TokenBucketRateLimiter({ ratePerMinute: config.rateLimitPerMin });
  }

  private async get<T>(path: string, opts: { allow404?: boolean } = {}): Promise<T | null> {
    this.limiter.take();
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        headers: {
          'User-Agent': this.userAgent,
          Accept: 'application/json',
          // Вътрешното API (127.0.0.1:4000) иначе пренасочва към https.
          'x-forwarded-proto': 'https',
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new Error(`imotai API GET ${path} failed: ${(err as Error).message}`);
    }
    if (res.status === 404 && opts.allow404) return null;
    if (!res.ok) {
      throw new Error(`imotai API GET ${path} → ${res.status}`);
    }
    return (await res.json()) as T;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    this.limiter.take();
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'User-Agent': this.userAgent,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'x-forwarded-proto': 'https',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new Error(`imotai API POST ${path} failed: ${(err as Error).message}`);
    }
    if (!res.ok) {
      throw new Error(`imotai API POST ${path} → ${res.status}`);
    }
    return (await res.json()) as T;
  }

  getValuationOptions(): Promise<ValuationOptions> {
    return this.get<ValuationOptions>('/properties/valuation-options') as Promise<ValuationOptions>;
  }

  getPriceIndex(): Promise<PriceIndexEntry[]> {
    return this.get<PriceIndexEntry[]>('/properties/price-index') as Promise<PriceIndexEntry[]>;
  }

  search(params: SearchParams): Promise<SearchResponse> {
    return this.post<SearchResponse>('/properties/search', { source: 'chatbot', ...params });
  }

  getProperty(idOrSlug: string): Promise<PropertyRecord | null> {
    return this.get<PropertyRecord>(`/properties/${encodeURIComponent(idOrSlug)}`, { allow404: true });
  }

  getPricePage(path: string): Promise<PricePageRecord | null> {
    // API-то иска „plovdiv/karshiyaka“, без „/ceni/“ отпред (иначе 404, 01.11.2026).
    const apiPath = path.replace(/^\/?ceni\//, '').replace(/^\/+/, '');
    return this.get<PricePageRecord>(`/properties/price?path=${encodeURIComponent(apiPath)}`, {
      allow404: true,
    });
  }

  getMarketReportIndex(): Promise<MarketReportIndexEntry[]> {
    return this.get<MarketReportIndexEntry[]>('/properties/market-report-index') as Promise<MarketReportIndexEntry[]>;
  }

  getMarketReport(city: string, month: string): Promise<PropertyRecord | null> {
    const qs = new URLSearchParams({ city, month });
    return this.get<PropertyRecord>(`/properties/market-report?${qs.toString()}`, { allow404: true });
  }

  getValuation(params: ValuationParams): Promise<PropertyRecord | null> {
    const qs = new URLSearchParams({
      city: params.city,
      type: params.type,
      area: String(params.area),
    });
    if (params.hood) qs.set('hood', params.hood);
    return this.get<PropertyRecord>(`/properties/valuation?${qs.toString()}`, { allow404: true });
  }
}
