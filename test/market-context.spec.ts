import { describe, it, expect } from 'vitest';
import { listingMarketContext, districtMarketContext } from '../src/lib/market-context.js';

describe('listingMarketContext', () => {
  it('maps the API priceContext', () => {
    const out = listingMarketContext({
      cityName: 'София',
      hoodName: 'Лозенец',
      ppsqm: 2900,
      hoodAvgPpsqm: 2600,
      hoodMedianPpsqm: 2550,
      vsAvgPct: 12,
      sampleCount: 40,
      similarCount: 9,
      cenniPath: '/ceni/sofia/lozenets',
    });
    expect(out).toEqual({
      districtAveragePricePerSqm: 2600,
      districtMedianPricePerSqm: 2550,
      deviationPercent: 12,
      comparableActiveListings: 9,
      basedOnCount: 40,
      pricePageUrl: 'https://imotai.bg/ceni/sofia/lozenets',
    });
  });

  it('null priceContext → null', () => {
    expect(listingMarketContext(null)).toBeNull();
    expect(listingMarketContext(undefined)).toBeNull();
    expect(listingMarketContext('x')).toBeNull();
  });

  it('all aggregates null → null (nothing computed)', () => {
    expect(
      listingMarketContext({
        hoodAvgPpsqm: null,
        hoodMedianPpsqm: null,
        vsAvgPct: null,
        similarCount: 0,
        sampleCount: 0,
        cenniPath: null,
      }),
    ).toBeNull();
  });

  it('no cenniPath → pricePageUrl null but still returns the numbers', () => {
    const out = listingMarketContext({
      hoodAvgPpsqm: 2000,
      hoodMedianPpsqm: null,
      vsAvgPct: -5,
      similarCount: 3,
      sampleCount: 12,
      cenniPath: null,
    });
    expect(out).toMatchObject({
      districtAveragePricePerSqm: 2000,
      deviationPercent: -5,
      pricePageUrl: null,
    });
  });
});

describe('districtMarketContext', () => {
  const page = {
    count: 60,
    avgPpsqm: 2600,
    ppsqm: { p25: 2300, p50: 2550, p75: 3000 },
    byRooms: [
      { label: '2 стаи', count: 20, avgPpsqm: 2500 },
      { label: '3 стаи', count: 25, avgPpsqm: 2650 },
    ],
  };

  it('uses the room-bucket average when rooms match, and computes deviation', () => {
    const out = districtMarketContext(page, 2800, 3);
    expect(out).toMatchObject({
      districtAveragePricePerSqm: 2650,
      comparableListings: 25,
      deviationPercent: 6, // round((2800-2650)/2650*100)
    });
    expect(out?.basis).toMatch(/district offers/i);
  });

  it('falls back to the median when the room bucket is unknown', () => {
    const out = districtMarketContext(page, 2550, null);
    expect(out).toMatchObject({
      districtAveragePricePerSqm: 2550,
      comparableListings: 60,
      deviationPercent: 0,
    });
  });

  it('no listing pricePerSqm → deviationPercent null', () => {
    const out = districtMarketContext(page, null, 3);
    expect(out?.deviationPercent).toBeNull();
  });

  it('count < 8 → null', () => {
    expect(districtMarketContext({ ...page, count: 5 }, 2800, 3)).toBeNull();
  });

  it('non-object → null', () => {
    expect(districtMarketContext(null, 2800, 3)).toBeNull();
  });
});
