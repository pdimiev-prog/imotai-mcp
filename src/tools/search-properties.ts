import type { ApiClient, PropertyRecord } from '../api-client.js';
import { num, str } from '../lib/coerce.js';
import { normalizeKey } from '../normalize.js';
import { districtMarketContext, type DistrictMarketContext } from '../lib/market-context.js';

const SITE = 'https://imotai.bg';

export type SearchInput = {
  city: string;
  district?: string;
  propertyType?: string;
  transactionType: 'sale' | 'rent';
  minPrice?: number;
  maxPrice?: number;
  minArea?: number;
  maxArea?: number;
  rooms?: string;
  limit?: number;
};

export type SearchResultRow = {
  id: string;
  url: string;
  slug: string | null;
  title: string | null;
  propertyType: string | null;
  transactionType: string | null;
  price: number | null;
  priceOnRequest: boolean;
  currency: string | null;
  pricePerSqm: number | null;
  area: number | null;
  plotArea: number | null;
  rooms: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  floor: number | null;
  totalFloors: number | null;
  buildYear: number | null;
  construction: string | null;
  isNewConstruction: boolean;
  district: string | null;
  city: string | null;
  region: string | null;
  marketContext: DistrictMarketContext | null;
};

function detailUrl(p: PropertyRecord): string {
  const handle = str(p.slug, 350) ?? str(p.id, 64) ?? '';
  return `${SITE}/properties/${p.isNewConstruction ? 'building/' : ''}${handle}`;
}

/** Explicit allowlist — a field not written here is a field not leaked. */
function toRow(p: PropertyRecord): Omit<SearchResultRow, 'marketContext'> {
  return {
    id: String(p.id ?? ''),
    url: detailUrl(p),
    slug: str(p.slug, 350),
    title: str(p.title, 300),
    propertyType: str(p.propertyType, 40),
    transactionType: str(p.listingType, 10),
    price: num(p.price),
    priceOnRequest: Boolean(p.priceOnRequest),
    currency: str(p.currency, 3),
    pricePerSqm: num(p.pricePerSqm),
    area: num(p.areaSqm),
    plotArea: num(p.plotAreaSqm),
    rooms: num(p.rooms),
    bedrooms: num(p.bedrooms),
    bathrooms: num(p.bathrooms),
    floor: num(p.floor),
    totalFloors: num(p.totalFloors),
    buildYear: num(p.yearBuilt),
    construction: str(p.construction, 50),
    isNewConstruction: Boolean(p.isNewConstruction),
    district: str(p.neighborhood, 120),
    city: str(p.city, 120),
    region: str(p.region, 120),
  };
}

export async function searchProperties(
  client: Pick<ApiClient, 'search' | 'getValuationOptions' | 'getPricePage'>,
  input: SearchInput,
): Promise<{ results: SearchResultRow[]; total: number; shown: number } | { error: string }> {
  const limit = Math.min(25, Math.max(1, Math.trunc(input.limit ?? 10)));
  const params = {
    page: 1,
    limit,
    sortBy: 'relevance',
    city: input.city,
    listingType: input.transactionType,
    ...(input.district ? { neighborhood: input.district } : {}),
    ...(input.propertyType ? { propertyType: input.propertyType } : {}),
    ...(input.minPrice != null ? { priceMin: input.minPrice } : {}),
    ...(input.maxPrice != null ? { priceMax: input.maxPrice } : {}),
    ...(input.minArea != null ? { areaSqmMin: input.minArea } : {}),
    ...(input.maxArea != null ? { areaSqmMax: input.maxArea } : {}),
    ...(input.rooms ? { rooms: input.rooms } : {}),
  };

  let res;
  try {
    res = await client.search(params);
  } catch (err) {
    return { error: `Search failed: ${(err as Error).message}` };
  }

  const cards = Array.isArray(res.data) ? res.data.slice(0, limit) : [];
  const baseRows = cards.map(toRow);

  // District-level market context: one /ceni lookup per distinct (city, district),
  // resolved to slugs via valuation-options. Never call get_property per row.
  const geoKey = (city: string | null, district: string | null): string | null =>
    city && district ? `${normalizeKey(city)}|${normalizeKey(district)}` : null;

  const pageByGeo = new Map<string, unknown>();
  try {
    const distinct = new Set(
      baseRows.map((r) => geoKey(r.city, r.district)).filter((k): k is string => !!k),
    );
    if (distinct.size > 0) {
      const opts = await client.getValuationOptions();
      for (const key of distinct) {
        const [cityKey, districtKey] = key.split('|');
        const city = opts.cities.find(
          (c) => normalizeKey(c.slug) === cityKey || normalizeKey(c.name) === cityKey,
        );
        if (!city) continue;
        const hood = opts.hoods.find(
          (h) =>
            h.citySlug === city.slug &&
            (normalizeKey(h.slug) === districtKey || normalizeKey(h.name) === districtKey),
        );
        if (!hood) continue;
        const page = await client.getPricePage(`/ceni/${city.slug}/${hood.slug}`).catch(() => null);
        if (page) pageByGeo.set(key, page);
      }
    }
  } catch {
    // market context is best-effort; a failure just leaves it null
  }

  const results: SearchResultRow[] = baseRows.map((r) => {
    const key = geoKey(r.city, r.district);
    const page = key ? pageByGeo.get(key) : null;
    return {
      ...r,
      marketContext: page ? districtMarketContext(page, r.pricePerSqm, r.rooms) : null,
    };
  });

  return { results, total: num(res.meta?.total) ?? results.length, shown: results.length };
}
