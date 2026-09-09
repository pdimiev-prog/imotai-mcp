import { config } from './config.js';

export type ValuationOptions = {
  cities: { slug: string; name: string }[];
  hoods: { citySlug: string; slug: string; name: string }[];
  types: { value: string; label: string }[];
};

export type PriceIndexEntry = { path: string; count: number; label: string };

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

export class ApiClient {
  private readonly baseUrl: string;
  private readonly userAgent: string;
  private readonly timeoutMs: number;

  constructor(opts: { baseUrl?: string; userAgent?: string; timeoutMs?: number } = {}) {
    this.baseUrl = (opts.baseUrl ?? config.apiUrl).replace(/\/+$/, '');
    this.userAgent = opts.userAgent ?? config.userAgent;
    this.timeoutMs = opts.timeoutMs ?? config.httpTimeoutMs;
  }

  private async get<T>(path: string, opts: { allow404?: boolean } = {}): Promise<T | null> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        headers: { 'User-Agent': this.userAgent, Accept: 'application/json' },
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
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'User-Agent': this.userAgent,
          Accept: 'application/json',
          'Content-Type': 'application/json',
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
    return this.get<PricePageRecord>(`/properties/price?path=${encodeURIComponent(path)}`, {
      allow404: true,
    });
  }
}
