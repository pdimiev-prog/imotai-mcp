import type { ApiClient } from '../api-client.js';
import { resolveCity } from '../normalize.js';
import { num, str } from '../lib/coerce.js';

const SITE = 'https://imotai.bg';

export type MarketReportInput = { city: string; month?: string };

/**
 * Месечният пазарен отчет на ImotAI за град (`/pazar/<град>/<ГГГГ-ММ>`):
 * медиана €/кв.м за апартамент, промяна спрямо предходния месец, квартали,
 * нови обяви. Без `month` — последният публикуван.
 */
export async function getMarketReport(
  client: Pick<ApiClient, 'getValuationOptions' | 'getMarketReportIndex' | 'getMarketReport'>,
  input: MarketReportInput,
): Promise<Record<string, unknown>> {
  const options = await client.getValuationOptions();
  const city = resolveCity(input.city, options.cities);
  if (!city) return { error: `Unknown city "${input.city}". Call list_districts to see valid city slugs.` };

  const index = await client.getMarketReportIndex();
  const entry = index.find((c) => c.citySlug === city.slug);
  if (!entry || entry.months.length === 0) {
    return {
      available: false,
      city: city.name,
      reason: 'No monthly report for this city yet (needs at least 50 sale offers for apartments).',
      citiesWithReports: index.map((c) => c.citySlug),
    };
  }
  const month = input.month ?? entry.months[0];
  if (!entry.months.includes(month)) {
    return { error: `No report for ${city.name} for ${month}. Available months: ${entry.months.join(', ')}.` };
  }

  const r = await client.getMarketReport(city.slug, month);
  if (!r) return { error: `No report for ${city.name} for ${month}.` };

  const place = (p: unknown) => {
    const o = (p ?? {}) as Record<string, unknown>;
    return {
      name: str(o.name, 120),
      medianPricePerSqm: num(o.median),
      pricePerSqmP25: num(o.p25),
      pricePerSqmP75: num(o.p75),
      offers: num(o.offers),
      previousMonthMedian: num(o.prevMedian),
      changePercent: num(o.changePct),
    };
  };
  return {
    available: true,
    city: city.name,
    month,
    monthLabel: str(r.monthLabel, 40),
    asOf: str(r.asOf, 20),
    propertyType: 'apartment',
    listingType: 'sale',
    cityStats: place(r.city),
    districts: Array.isArray(r.hoods) ? r.hoods.map(place) : [],
    newListingsInMonth: num(r.newListings),
    availableMonths: entry.months,
    basis:
      'Median asking price per m² of apartments for sale on imotai.bg, snapshot on the last day of the month. ' +
      'Asking prices, not closed transactions. Change is versus the previous month-end snapshot.',
    url: `${SITE}/pazar/${city.slug}/${month}`,
    source: 'ImotAI (imotai.bg), CC BY 4.0',
  };
}
