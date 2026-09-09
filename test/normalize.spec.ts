import { describe, it, expect } from 'vitest';
import { normalizeKey, resolveCity } from '../src/normalize.js';

describe('normalizeKey', () => {
  it('lowercases, trims, strips diacritics', () => {
    expect(normalizeKey('  Sofia ')).toBe('sofia');
    expect(normalizeKey('Стара Загора')).toBe('стара загора');
    expect(normalizeKey('Ćafé')).toBe('cafe');
  });
});

describe('resolveCity', () => {
  const cities = [
    { slug: 'sofia', name: 'София' },
    { slug: 'stara-zagora', name: 'Стара Загора' },
    { slug: 'plovdiv', name: 'Пловдив' },
  ];

  it('matches by slug', () => {
    expect(resolveCity('sofia', cities)).toEqual({ slug: 'sofia', name: 'София' });
    expect(resolveCity('SOFIA', cities)).toEqual({ slug: 'sofia', name: 'София' });
  });

  it('matches by exact Cyrillic name', () => {
    expect(resolveCity('Пловдив', cities)).toEqual({ slug: 'plovdiv', name: 'Пловдив' });
    expect(resolveCity('  стара загора ', cities)).toEqual({
      slug: 'stara-zagora',
      name: 'Стара Загора',
    });
  });

  it('returns null for an unknown city', () => {
    expect(resolveCity('atlantis', cities)).toBeNull();
  });
});
