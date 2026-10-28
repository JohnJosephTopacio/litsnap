// 30 lookups a minute per client IP, counted by one Durable Object per IP (API-12…14).
// Decision: docs/decisions/0004 (the rate limiting binding isn't enforced on the Free plan).
import { DurableObject } from 'cloudflare:workers';

export interface Limit {
  requests: number;
  windowMs: number;
}

export const RATE_LIMIT = { requests: 30, windowMs: 60_000 } as const satisfies Limit;
/** Uncached image lookups a minute for everyone: at most 150 Wikimedia requests (API-24). */
export const IMAGE_BUDGET = { requests: 50, windowMs: 60_000 } as const satisfies Limit;

export type RateVerdict = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/**
 * Counts one IP's requests in a fixed window that starts at its first request (API-13). Nothing
 * is stored: if the object is evicted, the IP just gets a fresh window.
 */
export class RateLimiter extends DurableObject<Env> {
  #windowStart = -Infinity;
  #count = 0;

  // RED PHASE: `limit` is ignored until the implementation PR (API-13, API-24).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- used by the implementation PR
  hit(now: number, _limit: Limit = RATE_LIMIT): RateVerdict {
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

// RED PHASE: stubs until the implementation PR (API-23, API-24).
/** The rate-limit key for a client: an IPv6 address's /64, an IPv4 address, or `unknown`. */
export const clientKey: (ip: string) => string = (ip) => ip;

/** Asks the one `RateLimiter` for everyone whether an uncached image lookup may go ahead. */
export const checkImageBudget: (env: Env) => Promise<RateVerdict> = () =>
  Promise.reject(new Error('checkImageBudget is not implemented yet'));

/** Asks the IP's `RateLimiter` whether this request may go ahead. */
export function checkRateLimit(env: Env, ip: string): Promise<RateVerdict> {
  const limiter = env.RATE_LIMITER.get(env.RATE_LIMITER.idFromName(ip));
  return limiter.hit(Date.now());
}
