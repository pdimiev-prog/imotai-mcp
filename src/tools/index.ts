import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from '../api-client.js';
import { listDistricts } from './list-districts.js';

const LIST_DISTRICTS_DESCRIPTION =
  'List the districts (neighbourhoods) of a Bulgarian city that ImotAI has data for, ' +
  'with the count of active listings in each where a public price page exists. ' +
  'Call this first to learn which "district" values are valid for the other ImotAI tools in a given city.';

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
}
