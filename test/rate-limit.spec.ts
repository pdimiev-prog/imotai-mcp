import { describe, it, expect } from 'vitest';
import { TokenBucketRateLimiter, RateLimitError } from '../src/rate-limit.js';

describe('TokenBucketRateLimiter', () => {
  it('allows up to capacity, then throws RateLimitError', () => {
    let t = 1_000_000;
    const rl = new TokenBucketRateLimiter({ ratePerMinute: 5, now: () => t });
    for (let i = 0; i < 5; i++) rl.take();
    expect(() => rl.take()).toThrow(RateLimitError);
  });

  it('refills over elapsed time (rate/60000 per ms)', () => {
    let t = 0;
    const rl = new TokenBucketRateLimiter({ ratePerMinute: 60, now: () => t });
    for (let i = 0; i < 60; i++) rl.take();
    expect(() => rl.take()).toThrow(RateLimitError);
    t += 1_000; // 1s -> +1 token at 60/min
    expect(() => rl.take()).not.toThrow();
    expect(() => rl.take()).toThrow(RateLimitError);
  });

  it('never exceeds capacity after a long idle gap', () => {
    let t = 0;
    const rl = new TokenBucketRateLimiter({ ratePerMinute: 10, now: () => t });
    t += 10 * 60_000; // idle 10 minutes
    for (let i = 0; i < 10; i++) rl.take();
    expect(() => rl.take()).toThrow(RateLimitError);
  });

  it('RateLimitError carries the exact Bulgarian message and name', () => {
    const err = new RateLimitError();
    expect(err.name).toBe('RateLimitError');
    expect(err.message).toBe('Твърде много заявки за кратко — изчакайте минута.');
  });

  it('take(cost) consumes multiple tokens', () => {
    let t = 0;
    const rl = new TokenBucketRateLimiter({ ratePerMinute: 60, now: () => t });
    rl.take(60);
    expect(() => rl.take()).toThrow(RateLimitError);
  });
});
