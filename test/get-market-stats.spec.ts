import { describe, it, expect } from 'vitest';
import { getMarketStats } from '../src/tools/get-market-stats.js';

const options = {
  cities: [
    { slug: 'sofia', name: 'София' },
    { slug: 'plovdiv', name: 'Пловдив' },
  ],
  hoods: [
    { citySlug: 'sofia', slug: 'lozenets', name: 'Лозенец' },
    { citySlug: 'plovdiv', slug: 'trakiya', name: 'Тракия' },
  ],
  types: [],
};

function page(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    citySlug: 'sofia',
    cityName: 'София',
    hoodSlug: 'lozenets',
    hoodName: 'Лозенец',
    indexable: true,
    count: 64,
    avgPrice: 300000,
    avgPpsqm: 2650,
    price: { p25: 210000, p50: 285000, p75: 360000 },
    ppsqm: { p25: 2300, p50: 2600, p75: 3050 },
    byRooms: [{ label: '2 стаи', count: 20, avgPrice: 210000, avgPpsqm: 2500 }],
    siblings: [{ path: '/ceni/sofia/vitosha', label: 'Витоша', avgPpsqm: 2400, count: 30 }],
    priceSource: 'catalogue',
    ...over,
  };
}

function client(over: { options?: unknown; pages?: Record<string, unknown | null> } = {}) {
  return {
    getValuationOptions: async () => (over.options ?? options) as any,
    getPricePage: async (p: string) => (over.pages ? (over.pages[p] ?? null) : page()) as any,
  };
}

describe('getMarketStats', () => {
  it('district stats: maps the price page through the allowlist', async () => {
    const out = await getMarketStats(client(), { city: 'sofia', district: 'lozenets' });
    if ('error' in out || out.available === false) throw new Error('unexpected');
    expect(out).toMatchObject({
      available: true,
      city: 'София',
      district: 'Лозенец',
      count: 64,
      avgPrice: 300000,
      avgPricePerSqm: 2650,
      price: { p25: 210000, p50: 285000, p75: 360000 },
      pricePerSqm: { p25: 2300, p50: 2600, p75: 3050 },
      url: 'https://imotai.bg/ceni/sofia/lozenets',
    });
    expect(out.byRooms[0]).toEqual({
      label: '2 стаи',
      count: 20,
      avgPrice: 210000,
      avgPricePerSqm: 2500,
    });
    expect(out.neighbouringDistricts[0]).toEqual({
      url: 'https://imotai.bg/ceni/sofia/vitosha',
      label: 'Витоша',
      avgPricePerSqm: 2400,
      count: 30,
    });
    expect(out.basis).toMatch(/sale offers/i);
    expect(out).not.toHaveProperty('heading');
    expect(out).not.toHaveProperty('citySlug');
    expect(out).not.toHaveProperty('priceSource');
    expect(out).not.toHaveProperty('indexable');
  });

  it('city-level stats: no district → /ceni/<city>', async () => {
    const cityPage = page({ hoodSlug: null, hoodName: null, count: 900 });
    const out = await getMarketStats(client({ pages: { '/ceni/sofia': cityPage } }), { city: 'София' });
    if ('error' in out || out.available === false) throw new Error('unexpected');
    expect(out.district).toBeNull();
    expect(out.url).toBe('https://imotai.bg/ceni/sofia');
  });

  it('count < 8 → available:false with a reason, no stats', async () => {
    const out = await getMarketStats(
      client({ pages: { '/ceni/sofia/lozenets': page({ count: 5 }) } }),
      { city: 'sofia', district: 'lozenets' },
    );
    if ('error' in out) throw new Error('unexpected error');
    expect(out.available).toBe(false);
    if (out.available !== false) return;
    expect(out.count).toBe(5);
    expect(out.reason).toMatch(/8/);
    expect(out).not.toHaveProperty('price');
  });

  it('unknown city → error pointing at list_districts', async () => {
    const out = await getMarketStats(client(), { city: 'atlantis' });
    expect('error' in out).toBe(true);
    if (!('error' in out)) return;
    expect(out.error).toMatch(/atlantis/);
    expect(out.error).toMatch(/list_districts/);
  });

  it('unknown district in a known city → error pointing at list_districts', async () => {
    const out = await getMarketStats(client(), { city: 'sofia', district: 'nowhere' });
    expect('error' in out).toBe(true);
    if (!('error' in out)) return;
    expect(out.error).toMatch(/nowhere/);
    expect(out.error).toMatch(/list_districts/);
  });

  it('resolves a district by its Bulgarian name', async () => {
    let requested = '';
    const c = {
      getValuationOptions: async () => options as any,
      getPricePage: async (p: string) => {
        requested = p;
        return page() as any;
      },
    };
    await getMarketStats(c, { city: 'sofia', district: 'Лозенец' });
    expect(requested).toBe('/ceni/sofia/lozenets');
  });
});
