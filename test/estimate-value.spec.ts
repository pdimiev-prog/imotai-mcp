import { describe, it, expect } from 'vitest';
import { estimateValue, DISCLAIMER_BASE } from '../src/tools/estimate-value.js';

const options = {
  cities: [{ slug: 'sofia', name: 'София' }],
  hoods: [{ citySlug: 'sofia', slug: 'lozenets', name: 'Лозенец' }],
  types: [],
};

function valuation(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    cityName: 'София',
    hoodName: 'Лозенец',
    propertyTypeLabel: 'Апартамент',
    area: 80,
    sampleCount: 40,
    ppsqmAvg: 2600,
    estimate: 208000,
    low: 184000,
    high: 240000,
    cenniPath: '/ceni/sofia/lozenets',
    source: 'our_catalogue',
    ...over,
  };
}

function client(over: { options?: unknown; valuation?: unknown } = {}) {
  let capturedParams: any = null;
  const c = {
    getValuationOptions: async () => (over.options ?? options) as any,
    getValuation: async (params: any) => {
      capturedParams = params;
      return (over.valuation === undefined ? valuation() : over.valuation) as any;
    },
  };
  return { c, params: () => capturedParams };
}

describe('estimateValue', () => {
  it('maps a valuation result; disclaimer + referenceUrl present', async () => {
    const { c, params } = client();
    const out = await estimateValue(c, {
      city: 'sofia',
      district: 'lozenets',
      propertyType: 'apartment',
      area: 80,
    });
    expect(params()).toEqual({ city: 'sofia', type: 'apartment', area: 80, hood: 'lozenets' });
    if ('error' in out || out.available === false) throw new Error('unexpected');
    expect(out).toMatchObject({
      available: true,
      estimate: 208000,
      rangeLow: 184000,
      rangeHigh: 240000,
      basedOnCount: 40,
      confidence: 'medium',
      referenceUrl: 'https://imotai.bg/ceni/sofia/lozenets',
    });
    expect(out.disclaimer).toContain(DISCLAIMER_BASE);
    expect(out.disclaimer).toMatch(/40/);
  });

  it('confidence scales with sample size', async () => {
    const hi = await estimateValue(client({ valuation: valuation({ sampleCount: 55 }) }).c, {
      city: 'sofia',
      district: 'lozenets',
      propertyType: 'apartment',
      area: 80,
    });
    const lo = await estimateValue(client({ valuation: valuation({ sampleCount: 8 }) }).c, {
      city: 'sofia',
      district: 'lozenets',
      propertyType: 'apartment',
      area: 80,
    });
    if ('error' in hi || hi.available === false || 'error' in lo || lo.available === false) {
      throw new Error('x');
    }
    expect(hi.confidence).toBe('high');
    expect(lo.confidence).toBe('low');
  });

  it('market-blend source → confidence low + external-data note in disclaimer', async () => {
    const out = await estimateValue(
      client({ valuation: valuation({ sampleCount: 60, source: 'market' }) }).c,
      { city: 'sofia', district: 'lozenets', propertyType: 'apartment', area: 80 },
    );
    if ('error' in out || out.available === false) throw new Error('unexpected');
    expect(out.confidence).toBe('low');
    expect(out.disclaimer).toMatch(/външни пазарни данни/);
  });

  it('endpoint returns null → available:false, WITH a disclaimer', async () => {
    const out = await estimateValue(client({ valuation: null }).c, {
      city: 'sofia',
      district: 'lozenets',
      propertyType: 'apartment',
      area: 80,
    });
    if ('error' in out) throw new Error('unexpected error');
    expect(out.available).toBe(false);
    if (out.available !== false) return;
    expect(out.reason).toMatch(/5/);
    expect(out.disclaimer).toContain(DISCLAIMER_BASE);
  });

  it('unknown city → error pointing at list_districts', async () => {
    const out = await estimateValue(client().c, {
      city: 'atlantis',
      district: 'x',
      propertyType: 'apartment',
      area: 80,
    });
    expect('error' in out).toBe(true);
    if (!('error' in out)) return;
    expect(out.error).toMatch(/atlantis/);
    expect(out.error).toMatch(/list_districts/);
  });

  it('unknown district → error pointing at list_districts', async () => {
    const out = await estimateValue(client().c, {
      city: 'sofia',
      district: 'nowhere',
      propertyType: 'apartment',
      area: 80,
    });
    expect('error' in out).toBe(true);
    if (!('error' in out)) return;
    expect(out.error).toMatch(/nowhere/);
    expect(out.error).toMatch(/list_districts/);
  });

  it('resolves district + city by Bulgarian name', async () => {
    const { c, params } = client();
    await estimateValue(c, { city: 'София', district: 'Лозенец', propertyType: 'house', area: 150 });
    expect(params()).toEqual({ city: 'sofia', type: 'house', area: 150, hood: 'lozenets' });
  });
});
