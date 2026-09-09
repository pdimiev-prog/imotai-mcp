import { describe, it, expect } from 'vitest';
import { getProperty } from '../src/tools/get-property.js';

const full = {
  id: 'uuid-1',
  slug: 'mezoneten-vitosha',
  title: 'Мезонет с гледка',
  propertyType: 'apartment',
  listingType: 'sale',
  price: 420000,
  priceOnRequest: false,
  currency: 'EUR',
  pricePerSqm: 3100,
  areaSqm: 135,
  plotAreaSqm: null,
  rooms: 4,
  bedrooms: 3,
  bathrooms: 2,
  floor: 7,
  totalFloors: 8,
  yearBuilt: 2020,
  renovationYear: null,
  construction: 'тухла',
  heating: 'ТЕЦ',
  furnishing: 'обзаведен',
  city: 'София',
  region: 'София-град',
  neighborhood: 'Витоша',
  country: 'BG',
  features: ['гараж', 'тераса'],
  isNewConstruction: false,
  createdAt: '2026-08-01T10:00:00.000Z',
  // sensitive — must never appear:
  description: 'Обадете се на Мария 0899…',
  aiDescription: '…',
  contactPhone: '0899123123',
  contactPhoneMasked: '0899***123',
  hasPhone: true,
  agencyName: 'Мария Петрова',
  referenceNumber: 'ref-55',
  latitude: 42.63,
  longitude: 23.29,
  street: 'ул. Скрита 7',
  viewCount: 91,
  priceContext: { hoodAvgPpsqm: 2900 },
};

function client(value: unknown) {
  return { getProperty: async (_id: string) => value } as any;
}

describe('getProperty', () => {
  it('404 → { found: false } with a reason, never throws', async () => {
    const out = await getProperty(client(null), { id: 'nope' });
    expect(out).toEqual({ found: false, reason: expect.any(String) });
  });

  it('maps the detail through the allowlist + builds the URL', async () => {
    const out = await getProperty(client(full), { id: 'uuid-1' });
    if (!out.found) throw new Error('expected found');
    expect(out.url).toBe('https://imotai.bg/properties/mezoneten-vitosha');
    expect(out).toMatchObject({
      found: true,
      id: 'uuid-1',
      slug: 'mezoneten-vitosha',
      title: 'Мезонет с гледка',
      transactionType: 'sale',
      price: 420000,
      area: 135,
      rooms: 4,
      construction: 'тухла',
      heating: 'ТЕЦ',
      district: 'Витоша',
      city: 'София',
      country: 'BG',
      features: ['гараж', 'тераса'],
      isNewConstruction: false,
      createdAt: '2026-08-01T10:00:00.000Z',
    });
  });

  it('LEAKS NOTHING: no description/contact/location/internal fields', async () => {
    const out = await getProperty(client(full), { id: 'uuid-1' });
    if (!out.found) throw new Error('expected found');
    for (const key of [
      'description', 'aiDescription', 'contactPhone', 'contactPhoneMasked', 'hasPhone',
      'agencyName', 'referenceNumber', 'latitude', 'longitude', 'coordinates', 'street',
      'viewCount', 'priceContext',
    ]) {
      expect(out).not.toHaveProperty(key);
    }
  });

  it('new construction → /properties/building/<slug>', async () => {
    const out = await getProperty(client({ ...full, isNewConstruction: true, slug: 'sky-tower' }), {
      id: 'uuid-1',
    });
    if (!out.found) throw new Error('expected found');
    expect(out.url).toBe('https://imotai.bg/properties/building/sky-tower');
  });
});
