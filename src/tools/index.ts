import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from '../api-client.js';
import { listDistricts } from './list-districts.js';
import { searchProperties, type SearchInput } from './search-properties.js';
import { getProperty } from './get-property.js';
import { getMarketStats } from './get-market-stats.js';
import { estimateValue } from './estimate-value.js';
import { RateLimitError } from '../rate-limit.js';

type ToolResult = { content: { type: 'text'; text: string }[]; isError: boolean };

function toToolResult(result: unknown): ToolResult {
  const obj =
    typeof result === 'object' && result !== null ? (result as Record<string, unknown>) : null;
  const isError = !!obj && ('error' in obj || obj.found === false);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }], isError };
}

/** Run a tool body; convert any thrown error — RateLimitError especially — into a clean result. */
async function guard(run: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return toToolResult(await run());
  } catch (err) {
    const message =
      err instanceof RateLimitError
        ? err.message
        : `ImotAI request failed: ${(err as Error).message}`;
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: message }, null, 2) }],
      isError: true,
    };
  }
}

const LIST_DISTRICTS_DESCRIPTION =
  'List the districts (neighbourhoods) of a Bulgarian city that ImotAI has data for, ' +
  'with the count of active listings in each where a public price page exists. ' +
  'Call this first to learn which "district" values are valid for the other ImotAI tools in a given city.';

const PROPERTY_TYPES = [
  'apartment',
  'house',
  'villa',
  'studio',
  'office',
  'shop',
  'warehouse',
  'land',
  'garage',
  'other',
] as const;

export function registerTools(server: McpServer, client: ApiClient): void {
  server.registerTool(
    'list_districts',
    {
      title: 'List ImotAI districts for a city',
      description: LIST_DISTRICTS_DESCRIPTION,
      inputSchema: {
        city: z
          .string()
          .min(1)
          .describe('City slug ("sofia") or its Bulgarian name ("София").'),
      },
    },
    async ({ city }) => guard(() => listDistricts(client, { city })),
  );

  server.registerTool(
    'search_properties',
    {
      title: 'Search ImotAI listings',
      description:
        'Search Bulgarian real-estate listings on imotai.bg by city, district, property type, ' +
        'price range, area range and rooms. Returns up to 25 listings with structured fields, a ' +
        'link to each, and a district-level marketContext block (district average price per m² and ' +
        'how far this listing deviates from it). No contact details or free-text descriptions.',
      inputSchema: {
        city: z.string().min(1).describe('City slug ("sofia") or Bulgarian name.'),
        district: z
          .string()
          .optional()
          .describe('District slug from list_districts, e.g. "lozenets".'),
        propertyType: z.enum(PROPERTY_TYPES).optional(),
        transactionType: z.enum(['sale', 'rent']),
        minPrice: z.number().positive().optional(),
        maxPrice: z.number().positive().optional(),
        minArea: z.number().positive().optional(),
        maxArea: z.number().positive().optional(),
        rooms: z
          .string()
          .optional()
          .describe('CSV of room counts, e.g. "2,3"; "5+" for 5 or more.'),
        limit: z.number().int().min(1).max(25).optional().describe('Default 10, max 25.'),
      },
    },
    async (input) => guard(() => searchProperties(client, input as SearchInput)),
  );

  server.registerTool(
    'get_property',
    {
      title: 'Get one ImotAI listing',
      description:
        'Get the full structured data for one ImotAI listing by its id or slug: price, price per m², ' +
        'area, rooms, floor, construction, heating, location (city/district), features, and an ' +
        'authoritative per-listing marketContext (district average and median price per m², ' +
        'deviation percent, comparable active count). Does NOT return the broker free-text ' +
        'description, contact details, or exact coordinates.',
      inputSchema: {
        id: z.string().min(1).describe('The listing id (UUID) or its URL slug.'),
      },
    },
    async ({ id }) => guard(() => getProperty(client, { id })),
  );

  server.registerTool(
    'get_market_stats',
    {
      title: 'ImotAI market statistics for a city or district',
      description:
        'The market picture for a Bulgarian city or district on imotai.bg: number of offers, ' +
        'average and P25/P50/P75 for total price and price per m², a breakdown by room count, ' +
        'and the neighbouring districts for comparison. Sale offers, all residential types. ' +
        'Returns { available: false } below 8 offers.',
      inputSchema: {
        city: z.string().min(1).describe('City slug ("sofia") or Bulgarian name.'),
        district: z
          .string()
          .optional()
          .describe('District slug or name from list_districts; omit for city-level stats.'),
      },
    },
    async ({ city, district }) => guard(() => getMarketStats(client, { city, district })),
  );

  const VALUATION_TYPES = ['apartment', 'house', 'villa', 'studio', 'land'] as const;

  server.registerTool(
    'estimate_value',
    {
      title: 'ImotAI rough value positioning',
      description:
        'Rough price positioning for a property by city, district, type and area — based on the ' +
        'CURRENT ASKING PRICES of comparable active listings, not on closed transactions. Returns ' +
        'an estimate, a low–high range, a confidence level from sample size, and a mandatory ' +
        'disclaimer. Refuses below 5 comparable offers. You MUST show the "disclaimer" field to ' +
        'the user verbatim whenever you cite any number from this tool. Never call this an ' +
        'official or precise property valuation.',
      inputSchema: {
        city: z.string().min(1).describe('City slug ("sofia") or Bulgarian name.'),
        district: z.string().min(1).describe('District slug or name from list_districts.'),
        propertyType: z.enum(VALUATION_TYPES),
        area: z.number().positive().describe('Living area in m².'),
        rooms: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Accepted but not used for filtering.'),
      },
    },
    async ({ city, district, propertyType, area, rooms }) =>
      guard(() => estimateValue(client, { city, district, propertyType, area, rooms })),
  );
}
