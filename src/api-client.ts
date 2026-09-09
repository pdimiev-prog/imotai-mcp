import { config } from './config.js';

export type ValuationOptions = {
  cities: { slug: string; name: string }[];
  hoods: { citySlug: string; slug: string; name: string }[];
  types: { value: string; label: string }[];
};

export type PriceIndexEntry = { path: string; count: number; label: string };

export class ApiClient {
  private readonly baseUrl: string;
  private readonly userAgent: string;
  private readonly timeoutMs: number;

  constructor(opts: { baseUrl?: string; userAgent?: string; timeoutMs?: number } = {}) {
    this.baseUrl = (opts.baseUrl ?? config.apiUrl).replace(/\/+$/, '');
    this.userAgent = opts.userAgent ?? config.userAgent;
    this.timeoutMs = opts.timeoutMs ?? config.httpTimeoutMs;
  }

  private async get<T>(path: string): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        headers: { 'User-Agent': this.userAgent, Accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new Error(`imotai API GET ${path} failed: ${(err as Error).message}`);
    }
    if (!res.ok) {
      throw new Error(`imotai API GET ${path} → ${res.status}`);
    }
    return (await res.json()) as T;
  }

  getValuationOptions(): Promise<ValuationOptions> {
    return this.get<ValuationOptions>('/properties/valuation-options');
  }

  getPriceIndex(): Promise<PriceIndexEntry[]> {
    return this.get<PriceIndexEntry[]>('/properties/price-index');
  }
}
