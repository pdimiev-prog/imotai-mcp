import { describe, it, expect } from 'vitest';
import { registerTools } from '../src/tools/index.js';
import { RateLimitError } from '../src/rate-limit.js';

type Handler = (args: Record<string, unknown>) => Promise<{
  content: { type: string; text: string }[];
  isError?: boolean;
}>;

function collect(client: unknown): Map<string, Handler> {
  const handlers = new Map<string, Handler>();
  const server = {
    registerTool: (name: string, _cfg: unknown, cb: Handler) => handlers.set(name, cb),
  };
  registerTools(server as never, client as never);
  return handlers;
}

const OVER_LIMIT = 'Твърде много заявки за кратко — изчакайте минута.';

describe('registerTools error guard', () => {
  it('maps RateLimitError from any tool to the exact message + isError', async () => {
    const client = {
      getValuationOptions: async () => {
        throw new RateLimitError();
      },
      getPriceIndex: async () => [],
    };
    const res = await collect(client).get('list_districts')!({ city: 'sofia' });
    expect(res.isError).toBe(true);
    expect(JSON.parse(res.content[0].text)).toEqual({ error: OVER_LIMIT });
  });

  it('maps RateLimitError raised inside a tool that has its own catch (get_market_stats)', async () => {
    const client = {
      getValuationOptions: async () => ({
        cities: [{ slug: 'sofia', name: 'София' }],
        hoods: [],
        types: [],
      }),
      getPricePage: async () => {
        throw new RateLimitError();
      },
    };
    const res = await collect(client).get('get_market_stats')!({ city: 'sofia' });
    expect(res.isError).toBe(true);
    expect(JSON.parse(res.content[0].text)).toEqual({ error: OVER_LIMIT });
  });

  it('wraps a non-rate error with a generic prefix', async () => {
    const client = {
      getValuationOptions: async () => {
        throw new Error('boom');
      },
      getPriceIndex: async () => [],
    };
    const res = await collect(client).get('list_districts')!({ city: 'sofia' });
    expect(res.isError).toBe(true);
    expect(JSON.parse(res.content[0].text).error).toBe('ImotAI request failed: boom');
  });

  it('leaves a normal result untouched (isError false)', async () => {
    const client = {
      getValuationOptions: async () => ({
        cities: [{ slug: 'sofia', name: 'София' }],
        hoods: [{ citySlug: 'sofia', slug: 'lozenets', name: 'Лозенец' }],
        types: [],
      }),
      getPriceIndex: async () => [{ path: '/ceni/sofia/lozenets', count: 40, label: 'Лозенец' }],
    };
    const res = await collect(client).get('list_districts')!({ city: 'sofia' });
    expect(res.isError).toBe(false);
    expect(JSON.parse(res.content[0].text).districts[0].activeListings).toBe(40);
  });
});
