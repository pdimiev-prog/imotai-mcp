export class RateLimitError extends Error {
  constructor(message = 'Твърде много заявки за кратко — изчакайте минута.') {
    super(message);
    this.name = 'RateLimitError';
  }
}

export interface RateGate {
  take(cost?: number): void;
}

/** Token bucket, per process. capacity = ratePerMinute, refill = capacity/60000 per ms. */
export class TokenBucketRateLimiter implements RateGate {
  private readonly capacity: number;
  private readonly refillPerMs: number;
  private readonly now: () => number;
  private tokens: number;
  private last: number;

  constructor(opts: { ratePerMinute?: number; now?: () => number } = {}) {
    this.capacity = Math.max(1, Math.trunc(opts.ratePerMinute ?? 60));
    this.refillPerMs = this.capacity / 60_000;
    this.now = opts.now ?? Date.now;
    this.tokens = this.capacity;
    this.last = this.now();
  }

  take(cost = 1): void {
    const t = this.now();
    this.tokens = Math.min(this.capacity, this.tokens + (t - this.last) * this.refillPerMs);
    this.last = t;
    if (this.tokens < cost) throw new RateLimitError();
    this.tokens -= cost;
  }
}
