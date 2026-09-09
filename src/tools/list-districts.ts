import type { ApiClient } from '../api-client.js';
import { resolveCity } from '../normalize.js';

export type ListDistrictsResult =
  | {
      city: { slug: string; name: string };
      districts: { name: string; slug: string; activeListings: number | null }[];
      note: string;
    }
  | { error: string };

const NOTE_DEFAULT =
  'activeListings is filled only for districts with a public price page (>= 8 offers); a null count does not mean zero.';
const NOTE_EMPTY =
  'ImotAI tracks no districts for this city yet — use the city slug directly with search_properties / get_market_stats.';

export async function listDistricts(
  client: Pick<ApiClient, 'getValuationOptions' | 'getPriceIndex'>,
  input: { city: string },
): Promise<ListDistrictsResult> {
  const options = await client.getValuationOptions();
  const city = resolveCity(input.city, options.cities);
  if (!city) {
    const known = options.cities
      .map((c) => c.slug)
      .sort()
      .join(', ');
    return { error: `Unknown city "${input.city}". Recognised city slugs: ${known}.` };
  }

  const priceIndex = await client.getPriceIndex();
  const countByPath = new Map(priceIndex.map((e) => [e.path, e.count]));

  const districts = options.hoods
    .filter((h) => h.citySlug === city.slug)
    .map((h) => ({
      name: h.name,
      slug: h.slug,
      activeListings: countByPath.get(`/ceni/${city.slug}/${h.slug}`) ?? null,
    }));

  return {
    city: { slug: city.slug, name: city.name },
    districts,
    note: districts.length === 0 ? NOTE_EMPTY : NOTE_DEFAULT,
  };
}
