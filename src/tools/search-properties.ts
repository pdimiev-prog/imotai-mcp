import type { ApiClient, PropertyRecord } from '../api-client.js';
import { num, str } from '../lib/coerce.js';

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
};

function detailUrl(p: PropertyRecord): string {
  const handle = str(p.slug, 350) ?? str(p.id, 64) ?? '';
  return `${SITE}/properties/${p.isNewConstruction ? 'building/' : ''}${handle}`;
}

/** Explicit allowlist — a field not written here is a field not leaked. */
function toRow(p: PropertyRecord): SearchResultRow {
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
  client: Pick<ApiClient, 'search'>,
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

  const rows = (Array.isArray(res.data) ? res.data : []).slice(0, limit).map(toRow);
  return { results: rows, total: num(res.meta?.total) ?? rows.length, shown: rows.length };
}
