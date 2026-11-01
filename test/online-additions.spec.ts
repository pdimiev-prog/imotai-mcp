import { describe, it, expect, vi } from 'vitest';
import { searchProperties } from '../src/tools/search-properties.js';
import { getMarketReport } from '../src/tools/get-market-report.js';
import { ApiClient } from '../src/api-client.js';

const options = {
  cities: [{ slug: 'plovdiv', name: 'Пловдив' }],
  hoods: [{ citySlug: 'plovdiv', slug: 'karshiyaka', name: 'Кършияка' }],
  types: [],
};

describe('онлайн добавки (02.11.2026)', () => {
  it('търсенето праща града и квартала на кирилица', async () => {
    const search = vi.fn().mockResolvedValue({ data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 0 } });
    await searchProperties(
      { search, getValuationOptions: async () => options, getPricePage: async () => null } as never,
      { city: 'plovdiv', district: 'karshiyaka', transactionType: 'sale' } as never,
    );
    expect(search.mock.calls[0][0]).toMatchObject({ city: 'Пловдив', neighborhood: 'Кършияка' });
  });

  it('страницата с цени се търси без „/ceni/“ отпред', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
    await new ApiClient({ baseUrl: 'http://api', limiter: { take() {} } }).getPricePage('/ceni/plovdiv/karshiyaka');
    expect(fetchMock.mock.calls[0][0]).toBe('http://api/properties/price?path=plovdiv%2Fkarshiyaka');
    expect(fetchMock.mock.calls[0][1].headers['x-forwarded-proto']).toBe('https');
    vi.unstubAllGlobals();
  });

  it('месечният отчет: последният месец по подразбиране, с адрес и източник', async () => {
    const r = await getMarketReport(
      {
        getValuationOptions: async () => options,
        getMarketReportIndex: async () => [{ citySlug: 'plovdiv', cityName: 'Пловдив', months: ['2026-10'] }],
        getMarketReport: async () => ({
          monthLabel: 'октомври 2026',
          asOf: '2026-10-31',
          city: { name: 'Пловдив', median: 1506, p25: 1300, p75: 1912, offers: 1058, prevMedian: null, changePct: null },
          hoods: [],
          newListings: 170,
        }),
      },
      { city: 'Пловдив' },
    );
    expect(r).toMatchObject({ available: true, month: '2026-10', url: 'https://imotai.bg/pazar/plovdiv/2026-10' });
    expect((r.cityStats as { medianPricePerSqm: number }).medianPricePerSqm).toBe(1506);
  });

  it('месечният отчет: град без отчет → available:false', async () => {
    const r = await getMarketReport(
      {
        getValuationOptions: async () => options,
        getMarketReportIndex: async () => [],
        getMarketReport: async () => null,
      },
      { city: 'plovdiv' },
    );
    expect(r.available).toBe(false);
  });
});
