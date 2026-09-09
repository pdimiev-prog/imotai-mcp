import { describe, it, expect } from 'vitest';
import { listDistricts } from '../src/tools/list-districts.js';

const options = {
  cities: [
    { slug: 'sofia', name: 'София' },
    { slug: 'plovdiv', name: 'Пловдив' },
  ],
  hoods: [
    { citySlug: 'sofia', slug: 'lozenets', name: 'Лозенец' },
    { citySlug: 'sofia', slug: 'vitosha', name: 'Витоша' },
    { citySlug: 'plovdiv', slug: 'trakiya', name: 'Тракия' },
  ],
  types: [{ value: 'apartment', label: 'Апартамент' }],
};

const priceIndex = [
  { path: '/ceni/sofia', count: 900, label: 'x' },
  { path: '/ceni/sofia/lozenets', count: 64, label: 'y' },
  { path: '/ceni/plovdiv/trakiya', count: 30, label: 'z' },
];

function client(over: Partial<{ options: unknown; priceIndex: unknown }> = {}) {
  return {
    getValuationOptions: async () => (over.options ?? options) as any,
    getPriceIndex: async () => (over.priceIndex ?? priceIndex) as any,
  };
}

describe('listDistricts', () => {
  it('returns the city districts with counts from the price index', async () => {
    const out = await listDistricts(client(), { city: 'sofia' });
    expect('error' in out).toBe(false);
    if ('error' in out) return;
    expect(out.city).toEqual({ slug: 'sofia', name: 'София' });
    const byslug = Object.fromEntries(out.districts.map((d) => [d.slug, d]));
    expect(byslug.lozenets).toEqual({ slug: 'lozenets', name: 'Лозенец', activeListings: 64 });
    expect(byslug.vitosha.activeListings).toBeNull(); // no /ceni/sofia/vitosha entry
    expect(out.districts).toHaveLength(2);
    expect(out.note).toMatch(/null count does not mean zero/i);
  });

  it('resolves a Cyrillic city name', async () => {
    const out = await listDistricts(client(), { city: 'Пловдив' });
    if ('error' in out) throw new Error('unexpected error');
    expect(out.city.slug).toBe('plovdiv');
    expect(out.districts.map((d) => d.slug)).toEqual(['trakiya']);
  });

  it('unknown city → error listing the recognised slugs', async () => {
    const out = await listDistricts(client(), { city: 'atlantis' });
    expect('error' in out).toBe(true);
    if (!('error' in out)) return;
    expect(out.error).toMatch(/atlantis/);
    expect(out.error).toMatch(/sofia/);
    expect(out.error).toMatch(/plovdiv/);
  });

  it('known city with no districts → empty list + explaining note', async () => {
    const out = await listDistricts(client({ options: { ...options, hoods: [] } }), { city: 'sofia' });
    if ('error' in out) throw new Error('unexpected error');
    expect(out.districts).toEqual([]);
    expect(out.note).toMatch(/no districts/i);
  });
});
