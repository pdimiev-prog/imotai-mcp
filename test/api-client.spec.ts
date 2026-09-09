import { describe, it, expect, vi, afterEach } from 'vitest';
import { ApiClient } from '../src/api-client.js';
import { RateLimitError, type RateGate } from '../src/rate-limit.js';

const blockGate: RateGate = {
  take: () => {
    throw new RateLimitError();
  },
};

afterEach(() => vi.unstubAllGlobals());

describe('ApiClient rate limiting', () => {
  it('rejects with RateLimitError and never calls fetch when the bucket is empty', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const client = new ApiClient({ limiter: blockGate });
    await expect(client.getValuationOptions()).rejects.toBeInstanceOf(RateLimitError);
    await expect(client.search({})).rejects.toBeInstanceOf(RateLimitError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('takes one token per HTTP call when the bucket allows it', async () => {
    const takeSpy = vi.fn();
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ cities: [], hoods: [], types: [] }),
    })) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchSpy);
    const client = new ApiClient({ limiter: { take: takeSpy } });
    await client.getValuationOptions();
    expect(takeSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('defaults to a real limiter (no opts) and still performs a single call', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [],
    })) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchSpy);
    const client = new ApiClient();
    await client.getPriceIndex();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
