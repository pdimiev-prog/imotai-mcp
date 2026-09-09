import type { ApiClient, PropertyRecord } from '../api-client.js';
import { resolveCity, normalizeKey } from '../normalize.js';
import { num, str } from '../lib/coerce.js';

const SITE = 'https://imotai.bg';

export const DISCLAIMER_BASE =
  'Това е ориентировъчно позициониране спрямо офертните цени на активни сходни обяви, ' +
  'не е оценка по реални сделки и не е официална оценка на имот.';

export type EstimateValueInput = {
  city: string;
  district: string;
  propertyType: 'apartment' | 'house' | 'villa' | 'studio' | 'land';
  area: number;
  rooms?: number;
};

export type EstimateValueResult =
  | { error: string }
  | { available: false; reason: string; disclaimer: string }
  | {
      available: true;
      estimate: number | null;
      rangeLow: number | null;
      rangeHigh: number | null;
      basedOnCount: number;
      confidence: 'low' | 'medium' | 'high';
      disclaimer: string;
      referenceUrl: string | null;
    };

function buildDisclaimer(basedOnCount: number, isBlend: boolean): string {
  const sample = `Базирано на извадка от ${basedOnCount} обяви.`;
  const ext = isBlend ? ' Включени са и външни пазарни данни (imot.bg / alo.bg / Grok).' : '';
  return `${DISCLAIMER_BASE} ${sample}${ext}`;
}

function confidenceFor(basedOnCount: number, isBlend: boolean): 'low' | 'medium' | 'high' {
  if (isBlend) return 'low';
  if (basedOnCount >= 50) return 'high';
  if (basedOnCount >= 15) return 'medium';
  return 'low';
}

export async function estimateValue(
  client: Pick<ApiClient, 'getValuationOptions' | 'getValuation'>,
  input: EstimateValueInput,
): Promise<EstimateValueResult> {
  const options = await client.getValuationOptions();

  const city = resolveCity(input.city, options.cities);
  if (!city) {
    const known = options.cities
      .map((c) => c.slug)
      .sort()
      .join(', ');
    return {
      error: `Unknown city "${input.city}". Call list_districts to see valid city slugs (recognised: ${known}).`,
    };
  }

  const key = normalizeKey(input.district);
  const hood = options.hoods.find(
    (h) => h.citySlug === city.slug && (normalizeKey(h.slug) === key || normalizeKey(h.name) === key),
  );
  if (!hood) {
    return {
      error: `Unknown district "${input.district}" in ${city.name}. Call list_districts("${city.slug}") for the valid district slugs.`,
    };
  }

  let result: PropertyRecord | null;
  try {
    result = await client.getValuation({
      city: city.slug,
      type: input.propertyType,
      area: input.area,
      hood: hood.slug,
    });
  } catch (err) {
    return { error: `Valuation lookup failed: ${(err as Error).message}` };
  }

  if (!result) {
    return {
      available: false,
      reason: 'Fewer than 5 comparable offers — ImotAI does not produce an estimate here.',
      disclaimer: buildDisclaimer(0, false),
    };
  }

  const basedOnCount = num(result.sampleCount) ?? 0;
  const isBlend = result.source === 'market';
  const cenniPath = str(result.cenniPath, 200);

  return {
    available: true,
    estimate: num(result.estimate),
    rangeLow: num(result.low),
    rangeHigh: num(result.high),
    basedOnCount,
    confidence: confidenceFor(basedOnCount, isBlend),
    disclaimer: buildDisclaimer(basedOnCount, isBlend),
    referenceUrl: cenniPath ? `${SITE}${cenniPath}` : null,
  };
}
