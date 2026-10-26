// 30 lookups a minute per client IP, counted by one Durable Object per IP (API-12…14).
// Decision: docs/decisions/0004 (the rate limiting binding isn't enforced on the Free plan).
import { DurableObject } from 'cloudflare:workers';

export const RATE_LIMIT = { requests: 30, windowMs: 60_000 } as const;

export type RateVerdict = { allowed: true } | { allowed: false; retryAfterSeconds: number };

// RED PHASE: stubs until the implementation PR.

/** Counts one IP's requests in memory; nothing is stored (API-13). */
export class RateLimiter extends DurableObject<Env> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  hit(now: number): RateVerdict {
    throw new Error('RateLimiter.hit is not implemented yet');
  }
}

/** Asks the IP's `RateLimiter` whether this request may go ahead. */
export const checkRateLimit: (env: Env, ip: string) => Promise<RateVerdict> = () =>
  Promise.reject(new Error('checkRateLimit is not implemented yet'));
