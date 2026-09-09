import type { ApiClient, PropertyRecord } from '../api-client.js';
import { num, str } from '../lib/coerce.js';
import { listingMarketContext, type ListingMarketContext } from '../lib/market-context.js';
import { RateLimitError } from '../rate-limit.js';

const SITE = 'https://imotai.bg';

export type GetPropertyInput = { id: string };

export type GetPropertyResult =
  | { found: false; reason: string }
  | {
      found: true;
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
      renovationYear: number | null;
      construction: string | null;
      heating: string | null;
      furnishing: string | null;
      district: string | null;
      city: string | null;
      region: string | null;
      country: string | null;
      features: string[];
      isNewConstruction: boolean;
      createdAt: string | null;
      marketContext: ListingMarketContext | null;
    };

function detailUrl(p: PropertyRecord): string {
  const handle = str(p.slug, 350) ?? str(p.id, 64) ?? '';
  return `${SITE}/properties/${p.isNewConstruction ? 'building/' : ''}${handle}`;
}

export async function getProperty(
  client: Pick<ApiClient, 'getProperty'>,
  input: GetPropertyInput,
): Promise<GetPropertyResult> {
  let p: PropertyRecord | null;
  try {
    p = await client.getProperty(input.id);
  } catch (err) {
    if (err instanceof RateLimitError) throw err;
    return { found: false, reason: `Lookup failed: ${(err as Error).message}` };
  }
  if (!p) {
    return { found: false, reason: `No ImotAI listing for "${input.id}".` };
  }

  const features = Array.isArray(p.features)
    ? (p.features as unknown[]).map((f) => str(f, 60)).filter((f): f is string => !!f)
    : [];

  return {
    found: true,
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
    renovationYear: num(p.renovationYear),
    construction: str(p.construction, 50),
    heating: str(p.heating, 50),
    furnishing: str(p.furnishing, 30),
    district: str(p.neighborhood, 120),
    city: str(p.city, 120),
    region: str(p.region, 120),
    country: str(p.country, 2),
    features,
    isNewConstruction: Boolean(p.isNewConstruction),
    createdAt: str(p.createdAt, 40),
    marketContext: listingMarketContext(p.priceContext),
  };
}
