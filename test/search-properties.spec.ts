import { describe, it, expect } from 'vitest';
import { searchProperties } from '../src/tools/search-properties.js';

function card(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'p-1',
    slug: 'tristaen-lozenets',
    title: 'Тристаен в Лозенец',
    propertyType: 'apartment',
    listingType: 'sale',
    price: '250000',
    priceOnRequest: false,
    currency: 'EUR',
    pricePerSqm: '2800',
    areaSqm: '89',
    plotAreaSqm: null,
    rooms: 3,
    bedrooms: 2,
    bathrooms: 1,
    floor: 4,
    totalFloors: 6,
    yearBuilt: 2015,
    construction: 'тухла',
    isNewConstruction: false,
    city: 'София',
    region: 'София-град',
    neighborhood: 'Лозенец',
    // sensitive — must never appear in the tool output:
    description: 'обажда се брокер Иван 0888…',
    contactPhone: '0888123456',
    contactPhoneMasked: '0888***456',
    hasPhone: true,
    agencyName: 'Иван Иванов',
    agencyLogoUrl: 'https://x/y.png',
    referenceNumber: 'feed-9',
    latitude: 42.66,
    longitude: 23.33,
    street: 'ул. Тайна 3',
    viewCount: 812,
    ...over,
  };
}

function client(
  resp: {
    data?: unknown[];
    meta?: Record<string, unknown>;
    options?: unknown;
    pages?: Record<string, unknown | null>;
  } = {},
) {
  return {
    search: async (_params: unknown) => ({
      data: resp.data ?? [card()],
      meta: resp.meta ?? { page: 1, limit: 10, total: 1, totalPages: 1 },
    }),
    getValuationOptions: async () =>
      (resp.options ?? {
        cities: [{ slug: 'sofia', name: 'София' }],
        hoods: [{ citySlug: 'sofia', slug: 'lozenets', name: 'Лозенец' }],
        types: [],
      }) as any,
    getPricePage: async (p: string) => (resp.pages ? (resp.pages[p] ?? null) : null) as any,
  } as any;
}

describe('searchProperties', () => {
  it('maps a card through the allowlist and builds the detail URL', async () => {
    const out = await searchProperties(client(), { city: 'sofia', transactionType: 'sale' });
    if ('error' in out) throw new Error('unexpected error');
    expect(out).toMatchObject({ total: 1, shown: 1 });
    const r = out.results[0];
    expect(r).toEqual({
      id: 'p-1',
      url: 'https://imotai.bg/properties/tristaen-lozenets',
      slug: 'tristaen-lozenets',
      title: 'Тристаен в Лозенец',
      propertyType: 'apartment',
      transactionType: 'sale',
      price: 250000,
      priceOnRequest: false,
      currency: 'EUR',
      pricePerSqm: 2800,
      area: 89,
      plotArea: null,
      rooms: 3,
      bedrooms: 2,
      bathrooms: 1,
      floor: 4,
      totalFloors: 6,
      buildYear: 2015,
      construction: 'тухла',
      isNewConstruction: false,
      district: 'Лозенец',
      city: 'София',
      region: 'София-град',
      marketContext: null,
    });
  });

  it('attaches district-level marketContext from a /ceni page', async () => {
    const out = await searchProperties(
      client({
        pages: {
          '/ceni/sofia/lozenets': {
            count: 40,
            avgPpsqm: 2600,
            ppsqm: { p25: 0, p50: 2550, p75: 0 },
            byRooms: [{ label: '3 стаи', count: 12, avgPpsqm: 2700 }],
          },
        },
      }),
      { city: 'sofia', transactionType: 'sale' },
    );
    if ('error' in out) throw new Error('unexpected error');
    const mc = out.results[0].marketContext!;
    expect(mc.districtAveragePricePerSqm).toBe(2700); // 3-room bucket (card rooms: 3)
    expect(mc.comparableListings).toBe(12);
    expect(mc.deviationPercent).toBe(4); // round((2800-2700)/2700*100)
    expect(mc.basis).toMatch(/district offers/i);
  });

  it('LEAKS NOTHING: no personal / contact / location / internal fields in any row', async () => {
    const out = await searchProperties(client({ data: [card(), card({ id: 'p-2' })] }), {
      city: 'sofia',
      transactionType: 'sale',
    });
    if ('error' in out) throw new Error('unexpected error');
    const banned = [
      'description', 'contactPhone', 'contactPhoneMasked', 'hasPhone', 'agencyName',
      'agencyLogoUrl', 'referenceNumber', 'latitude', 'longitude', 'street', 'viewCount',
    ];
    for (const row of out.results) {
      for (const key of banned) expect(row).not.toHaveProperty(key);
    }
  });

  it('new construction → /properties/building/<slug>', async () => {
    const out = await searchProperties(
      client({ data: [card({ isNewConstruction: true, slug: 'kompleks-sky' })] }),
      { city: 'sofia', transactionType: 'sale' },
    );
    if ('error' in out) throw new Error('unexpected error');
    expect(out.results[0].url).toBe('https://imotai.bg/properties/building/kompleks-sky');
  });

  it('clamps limit to 1..25 and passes structured filters through', async () => {
    let captured: any;
    const c = {
      search: async (params: any) => {
        captured = params;
        return { data: [], meta: { page: 1, limit: 25, total: 0, totalPages: 0 } };
      },
    } as any;
    const out = await searchProperties(c, {
      city: 'sofia',
      district: 'Лозенец',
      propertyType: 'apartment',
      transactionType: 'rent',
      minPrice: 500,
      maxArea: 120,
      rooms: '2,3',
      limit: 999,
    });
    if ('error' in out) throw new Error('unexpected error');
    expect(captured).toMatchObject({
      city: 'sofia',
      neighborhood: 'Лозенец',
      propertyType: 'apartment',
      listingType: 'rent',
      priceMin: 500,
      areaSqmMax: 120,
      rooms: '2,3',
      limit: 25,
      page: 1,
    });
    expect(out.results).toEqual([]);
    expect(out.total).toBe(0);
  });
});
