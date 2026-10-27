// 30 lookups a minute per client IP, counted by one Durable Object per IP (API-12…14).
// Decision: docs/decisions/0004 (the rate limiting binding isn't enforced on the Free plan).
import { DurableObject } from 'cloudflare:workers';

export const RATE_LIMIT = { requests: 30, windowMs: 60_000 } as const;

export type RateVerdict = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/**
 * Counts one IP's requests in a fixed window that starts at its first request (API-13). Nothing
 * is stored: if the object is evicted, the IP just gets a fresh window.
 */
export class RateLimiter extends DurableObject<Env> {
  #windowStart = -Infinity;
  #count = 0;

  hit(now: number): RateVerdict {
    if (now >= this.#windowStart + RATE_LIMIT.windowMs) {
      this.#windowStart = now;
      this.#count = 0;
    }
    if (this.#count < RATE_LIMIT.requests) {
      this.#count += 1;
      return { allowed: true };
    }
    const left = this.#windowStart + RATE_LIMIT.windowMs - now;
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(left / 1000)) };
  }
}

/** Asks the IP's `RateLimiter` whether this request may go ahead. */
export function checkRateLimit(env: Env, ip: string): Promise<RateVerdict> {
  const limiter = env.RATE_LIMITER.get(env.RATE_LIMITER.idFromName(ip));
  return limiter.hit(Date.now());
}
