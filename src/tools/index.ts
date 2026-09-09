import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from '../api-client.js';
import { listDistricts } from './list-districts.js';
import { searchProperties, type SearchInput } from './search-properties.js';
import { getProperty } from './get-property.js';

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
    async ({ city }) => {
      const result = await listDistricts(client, { city });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        isError: 'error' in result,
      };
    },
  );

  server.registerTool(
    'search_properties',
    {
      title: 'Search ImotAI listings',
      description:
        'Search Bulgarian real-estate listings on imotai.bg by city, district, property type, ' +
        'price range, area range and rooms. Returns up to 25 listings with structured fields and ' +
        'a link to each. No contact details or free-text descriptions.',
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
    async (input) => {
      const result = await searchProperties(client, input as SearchInput);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        isError: 'error' in result,
      };
    },
  );

  server.registerTool(
    'get_property',
    {
      title: 'Get one ImotAI listing',
      description:
        'Get the full structured data for one ImotAI listing by its id or slug: price, price per m², ' +
        'area, rooms, floor, construction, heating, location (city/district), and features. ' +
        'Does NOT return the broker free-text description, contact details, or exact coordinates.',
      inputSchema: {
        id: z.string().min(1).describe('The listing id (UUID) or its URL slug.'),
      },
    },
    async ({ id }) => {
      const result = await getProperty(client, { id });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        isError: result.found === false,
      };
    },
  );
}
