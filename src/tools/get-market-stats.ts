import type { ApiClient, PricePageRecord } from '../api-client.js';
import { resolveCity, normalizeKey } from '../normalize.js';
import { num, str } from '../lib/coerce.js';
import { RateLimitError } from '../rate-limit.js';

const SITE = 'https://imotai.bg';
const MIN_SAMPLE = 8;

export type MarketStatsInput = { city: string; district?: string };

type Quartiles = { p25: number | null; p50: number | null; p75: number | null };

export type MarketStatsResult =
  | { error: string }
  | { available: false; city: string; district: string | null; count: number; reason: string }
  | {
      available: true;
      city: string;
      district: string | null;
      count: number;
      avgPrice: number | null;
      avgPricePerSqm: number | null;
      price: Quartiles;
      pricePerSqm: Quartiles;
      byRooms: {
        label: string;
        count: number;
        avgPrice: number | null;
        avgPricePerSqm: number | null;
      }[];
      neighbouringDistricts: {
        url: string;
        label: string;
        avgPricePerSqm: number | null;
        count: number;
      }[];
      basis: string;
      url: string;
    };

function quartiles(v: unknown): Quartiles {
  const q = (v ?? {}) as Record<string, unknown>;
  return { p25: num(q.p25), p50: num(q.p50), p75: num(q.p75) };
}

export async function getMarketStats(
  client: Pick<ApiClient, 'getValuationOptions' | 'getPricePage'>,
  input: MarketStatsInput,
): Promise<MarketStatsResult> {
  const options = await client.getValuationOptions();

  const city = resolveCity(input.city, options.cities);
  if (!city) {
    const known = options.cities
      .map((c) => c.slug)
      .sort()
      .join(', ');
    return {
      error: `Unknown city "${input.city}". Call list_districts to see valid city slugs (recognised: ${known}).`,
    };
  }

  let hoodSlug: string | null = null;
  let hoodName: string | null = null;
  if (input.district) {
    const key = normalizeKey(input.district);
    const hood = options.hoods.find(
      (h) =>
        h.citySlug === city.slug && (normalizeKey(h.slug) === key || normalizeKey(h.name) === key),
    );
    if (!hood) {
      return {
        error: `Unknown district "${input.district}" in ${city.name}. Call list_districts("${city.slug}") for the valid district slugs.`,
      };
    }
    hoodSlug = hood.slug;
    hoodName = hood.name;
  }

  const path = hoodSlug ? `/ceni/${city.slug}/${hoodSlug}` : `/ceni/${city.slug}`;
  const url = `${SITE}${path}`;

  let page: PricePageRecord | null;
  try {
    page = await client.getPricePage(path);
  } catch (err) {
    if (err instanceof RateLimitError) throw err;
    return { error: `Market stats lookup failed: ${(err as Error).message}` };
  }
  if (!page) {
    return { error: `ImotAI has no price data for ${url}.` };
  }

  const count = num(page.count) ?? 0;
  const district = str(page.hoodName, 120) ?? hoodName;
  const cityLabel = str(page.cityName, 120) ?? city.name;

  if (count < MIN_SAMPLE) {
    return {
      available: false,
      city: cityLabel,
      district,
      count,
      reason: `Fewer than ${MIN_SAMPLE} offers for this location — no reliable statistics.`,
    };
  }

  const byRoomsRaw = Array.isArray(page.byRooms) ? (page.byRooms as unknown[]) : [];
  const siblingsRaw = Array.isArray(page.siblings) ? (page.siblings as unknown[]) : [];

  return {
    available: true,
    city: cityLabel,
    district,
    count,
    avgPrice: num(page.avgPrice),
    avgPricePerSqm: num(page.avgPpsqm),
    price: quartiles(page.price),
    pricePerSqm: quartiles(page.ppsqm),
    byRooms: byRoomsRaw.map((r) => {
      const row = (r ?? {}) as Record<string, unknown>;
      return {
        label: str(row.label, 40) ?? '',
        count: num(row.count) ?? 0,
        avgPrice: num(row.avgPrice),
        avgPricePerSqm: num(row.avgPpsqm),
      };
    }),
    neighbouringDistricts: siblingsRaw.map((s) => {
      const sib = (s ?? {}) as Record<string, unknown>;
      const p = str(sib.path, 200) ?? '';
      return {
        url: p ? `${SITE}${p}` : SITE,
        label: str(sib.label, 120) ?? '',
        avgPricePerSqm: num(sib.avgPpsqm),
        count: num(sib.count) ?? 0,
      };
    }),
    basis: `Sale offers (active + paused), all residential types; snapshot ${new Date()
      .toISOString()
      .slice(0, 10)}`,
    url,
  };
}
