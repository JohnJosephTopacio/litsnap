// Acceptance criteria API-12…14 from docs/features/lookup-api.md.
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { checkRateLimit, RATE_LIMIT } from '../../src/rateLimit';
import { fakeProvider, FOUND, lookupPath, setUp } from './support';

/** The app with the real `checkRateLimit`, so requests go through the RateLimiter Durable Object. */
const setUpLimited = () =>
  setUp({ providers: [fakeProvider('wiktionary', FOUND)], rateLimit: checkRateLimit });

const fromIp = (ip: string) => ({ 'CF-Connecting-IP': ip });

describe('API-12: 30 requests a minute per IP', () => {
  it('the 31st is 429 with Retry-After, and other IPs are unaffected', async () => {
    const { get, logs } = setUpLimited();
    const ip = fromIp('203.0.113.12');

    // Valid, cached, and invalid requests all count.
    for (let i = 0; i < 10; i++) expect((await get(lookupPath('roof'), ip)).status).toBe(200);
    for (let i = 0; i < 10; i++)
      expect((await get(lookupPath(`word${String(i)}`), ip)).status).toBe(200);
    for (let i = 0; i < 10; i++) expect((await get('/lookup?term=roof', ip)).status).toBe(400);
    const limited = await get(lookupPath('roof'), ip);

    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: 'rate-limited' });
    expect(Number(limited.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1);
    expect(Number(limited.headers.get('Retry-After'))).toBeLessThanOrEqual(60);
    expect(limited.headers.get('Cache-Control')).toBe('no-store');
    expect(logs.at(-1)).toMatchObject({ status: 429, rateLimit: 'denied', cache: 'none' });
    expect((await get(lookupPath('roof'), fromIp('203.0.113.13'))).status).toBe(200);
  });

  it('requests without CF-Connecting-IP share the "unknown" IP', async () => {
    const { get } = setUpLimited();

    for (let i = 0; i < RATE_LIMIT.requests; i++) await get(lookupPath('roof'));

    expect((await get(lookupPath('roof'))).status).toBe(429);
    expect((await get(lookupPath('roof'), fromIp('unknown'))).status).toBe(429);
  });

  it('is 30 requests per 60 seconds', () => {
    expect(RATE_LIMIT).toEqual({ requests: 30, windowMs: 60_000 });
  });
});

describe('API-13: the window', () => {
  const limiter = (name: string) => env.RATE_LIMITER.get(env.RATE_LIMITER.idFromName(name));
  const T0 = 1_800_000_000_000;

  it('allows 30 in a window, then says how long to wait', async () => {
    const stub = limiter('window-1');

    for (let i = 0; i < 30; i++) expect(await stub.hit(T0 + i)).toEqual({ allowed: true });

    expect(await stub.hit(T0 + 1)).toEqual({ allowed: false, retryAfterSeconds: 60 });
    expect(await stub.hit(T0 + 30_500)).toEqual({ allowed: false, retryAfterSeconds: 30 });
    expect(await stub.hit(T0 + 59_999)).toEqual({ allowed: false, retryAfterSeconds: 1 });
  });

  it("starts a new window at the old one's end, and denied calls didn't count", async () => {
    const stub = limiter('window-2');

    for (let i = 0; i < 40; i++) await stub.hit(T0 + i);

    for (let i = 0; i < 30; i++) expect(await stub.hit(T0 + 60_000 + i)).toEqual({ allowed: true });
    expect(await stub.hit(T0 + 60_030)).toMatchObject({ allowed: false });
  });

  it('the window starts at the first call, not on the clock', async () => {
    const stub = limiter('window-3');

    expect(await stub.hit(T0 + 45_000)).toEqual({ allowed: true });
    for (let i = 0; i < 29; i++) await stub.hit(T0 + 45_000 + i);

    expect(await stub.hit(T0 + 104_999)).toEqual({ allowed: false, retryAfterSeconds: 1 });
    expect(await stub.hit(T0 + 105_000)).toEqual({ allowed: true });
  });
});

describe('API-14: fail open', () => {
  it('a failing rate limit check still serves the lookup', async () => {
    const { get, logs } = setUp({
      providers: [fakeProvider('wiktionary', FOUND)],
      rateLimit: () => Promise.reject(new Error('Durable Object unavailable')),
    });

    expect((await get(lookupPath('roof'))).status).toBe(200);
    expect(logs[0]).toMatchObject({ status: 200, rateLimit: 'error' });
  });
});
