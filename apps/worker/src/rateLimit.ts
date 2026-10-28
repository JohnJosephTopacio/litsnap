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

  /** `limit` is the IP limit, or the image budget for the limiter everyone shares (API-24). */
  hit(now: number, limit: Limit = RATE_LIMIT): RateVerdict {
    if (now >= this.#windowStart + limit.windowMs) {
      this.#windowStart = now;
      this.#count = 0;
    }
    if (this.#count < limit.requests) {
      this.#count += 1;
      return { allowed: true };
    }
    const left = this.#windowStart + limit.windowMs - now;
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(left / 1000)) };
  }
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const HEXTET = /^[0-9a-f]{1,4}$/;

/** `203.0.113.7`, or `undefined` if it isn't a valid IPv4 address. */
function ipv4(text: string): number[] | undefined {
  const octets = IPV4.exec(text)?.slice(1).map(Number);
  return octets?.every((octet) => octet <= 255) ? octets : undefined;
}

/** The eight groups of an IPv6 address, as numbers, or `undefined` if it isn't one. */
function ipv6(text: string): number[] | undefined {
  let address = text.toLowerCase();
  // An IPv4 address at the end (`::ffff:203.0.113.7`) is the last two groups.
  const lastColon = address.lastIndexOf(':');
  const tail = ipv4(address.slice(lastColon + 1));
  if (tail) {
    const [a = 0, b = 0, c = 0, d = 0] = tail;
    address = `${address.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = address.split('::');
  if (halves.length > 2) return undefined;
  const [head = '', rest] = halves;
  const left = head === '' ? [] : head.split(':');
  const right = rest === undefined || rest === '' ? [] : rest.split(':');
  const missing = 8 - left.length - right.length;
  if (rest === undefined ? missing !== 0 : missing < 1) return undefined;
  const groups = [...left, ...Array<string>(rest === undefined ? 0 : missing).fill('0'), ...right];
  return groups.every((group) => HEXTET.test(group))
    ? groups.map((group) => parseInt(group, 16))
    : undefined;
}

/** The rate-limit key for a client: an IPv6 address's /64, an IPv4 address, or `unknown` (API-23). */
export function clientKey(ip: string): string {
  if (ipv4(ip)) return ip;
  const groups = ipv6(ip);
  if (!groups) return 'unknown';
  // An IPv4 address written as IPv6 is that IPv4 address.
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    const [, , , , , , high = 0, low = 0] = groups;
    return [high >> 8, high & 255, low >> 8, low & 255].join('.');
  }
  return `${groups
    .slice(0, 4)
    .map((group) => group.toString(16))
    .join(':')}::/64`;
}

/** Asks the one `RateLimiter` for everyone whether an uncached image lookup may go ahead (API-24). */
export function checkImageBudget(env: Env): Promise<RateVerdict> {
  const budget = env.RATE_LIMITER.get(env.RATE_LIMITER.idFromName('wikimedia'));
  return budget.hit(Date.now(), IMAGE_BUDGET);
}

/** Asks the IP's `RateLimiter` whether this request may go ahead. */
export function checkRateLimit(env: Env, ip: string): Promise<RateVerdict> {
  const limiter = env.RATE_LIMITER.get(env.RATE_LIMITER.idFromName(ip));
  return limiter.hit(Date.now());
}
