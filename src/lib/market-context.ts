import { num } from './coerce.js';

const SITE = 'https://imotai.bg';
const MIN_SAMPLE = 8;

export type ListingMarketContext = {
  districtAveragePricePerSqm: number | null;
  districtMedianPricePerSqm: number | null;
  deviationPercent: number | null;
  comparableActiveListings: number | null;
  basedOnCount: number | null;
  pricePageUrl: string | null;
};

/** Maps the API's per-listing `priceContext` — the authoritative view. */
export function listingMarketContext(priceContext: unknown): ListingMarketContext | null {
  if (!priceContext || typeof priceContext !== 'object') return null;
  const pc = priceContext as Record<string, unknown>;

  const avg = num(pc.hoodAvgPpsqm);
  const median = num(pc.hoodMedianPpsqm);
  const deviation = num(pc.vsAvgPct);
  const similar = num(pc.similarCount);
  const sample = num(pc.sampleCount);

  if (avg === null && median === null && deviation === null && !similar && !sample) return null;

  const cenniPath = typeof pc.cenniPath === 'string' && pc.cenniPath ? pc.cenniPath : null;
  return {
    districtAveragePricePerSqm: avg,
    districtMedianPricePerSqm: median,
    deviationPercent: deviation,
    comparableActiveListings: similar,
    basedOnCount: sample,
    pricePageUrl: cenniPath ? `${SITE}${cenniPath}` : null,
  };
}

export type DistrictMarketContext = {
  districtAveragePricePerSqm: number | null;
  deviationPercent: number | null;
  comparableListings: number | null;
  basis: string;
};

function roomBucket(
  byRooms: unknown,
  rooms: number | null,
): { avg: number | null; count: number | null } | null {
  if (rooms === null || !Array.isArray(byRooms)) return null;
  for (const r of byRooms as unknown[]) {
    const row = (r ?? {}) as Record<string, unknown>;
    const label = typeof row.label === 'string' ? row.label : '';
    // labels: "1 стая", "2 стаи", … "5+ стаи"
    const m = label.match(/^(\d+)(\+)?/);
    if (!m) continue;
    const n = Number(m[1]);
    const isPlus = !!m[2];
    if (n === rooms || (isPlus && rooms >= n)) {
      return { avg: num(row.avgPpsqm), count: num(row.count) };
    }
  }
  return null;
}

/** District-level context for a search row — from one `/ceni` page. */
export function districtMarketContext(
  pricePage: unknown,
  listingPricePerSqm: number | null,
  rooms: number | null,
): DistrictMarketContext | null {
  if (!pricePage || typeof pricePage !== 'object') return null;
  const page = pricePage as Record<string, unknown>;
  const count = num(page.count) ?? 0;
  if (count < MIN_SAMPLE) return null;

  const bucket = roomBucket(page.byRooms, rooms);
  const ppsqm = (page.ppsqm ?? {}) as Record<string, unknown>;
  const districtAvg = bucket?.avg ?? num(ppsqm.p50) ?? num(page.avgPpsqm);
  const comparableListings = bucket?.count ?? count;

  const deviationPercent =
    listingPricePerSqm !== null && districtAvg
      ? Math.round(((listingPricePerSqm - districtAvg) / districtAvg) * 100)
      : null;

  return {
    districtAveragePricePerSqm: districtAvg,
    deviationPercent,
    comparableListings,
    basis: `District offers (active + paused), sale, all types; snapshot ${new Date()
      .toISOString()
      .slice(0, 10)}`,
  };
}
