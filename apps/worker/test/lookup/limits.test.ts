// Acceptance criteria API-23 and API-24 from docs/features/lookup-api.md, and API-13's `limit`.
// `caches.default` and Durable Objects keep their state across tests, so each test has its own
// terms, IPs and limiter names.
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { imagesCacheKey } from '../../src/cache';
import {
  checkImageBudget,
  checkRateLimit,
  clientKey,
  IMAGE_BUDGET,
  RATE_LIMIT,
  type RateVerdict,
} from '../../src/rateLimit';
import { fakeImages, fakeProvider, FOUND, IMAGES_FOUND, lookupPath, setUp } from './support';

const fromIp = (ip: string) => ({ 'CF-Connecting-IP': ip });

/** An image budget that answers `verdict` (or rejects) and counts how often it was asked. */
function fakeBudget(verdict: RateVerdict | 'throws') {
  let asked = 0;
  const imageBudget = () => {
    asked += 1;
    return verdict === 'throws'
      ? Promise.reject(new Error('Durable Object over its daily cap'))
      : Promise.resolve(verdict);
  };
  return { imageBudget, asked: () => asked };
}

const SPENT: RateVerdict = { allowed: false, retryAfterSeconds: 12 };

describe('API-23: an IPv6 connection counts as one client', () => {
  it.each([
    ['2001:db8:1:2::1', '2001:db8:1:2::/64'],
    ['2001:db8:1:2:ffff::9', '2001:db8:1:2::/64'],
    ['2001:DB8:0001:0002:0:0:0:1', '2001:db8:1:2::/64'],
    ['2001:0db8:0000:0000:0000:0000:0000:0001', '2001:db8:0:0::/64'],
    ['2001:db8::1', '2001:db8:0:0::/64'],
    ['::1', '0:0:0:0::/64'],
    ['::ffff:203.0.113.7', '203.0.113.7'],
    ['not-an-ip', 'unknown'],
    ['999.0.0.1', 'unknown'],
    ['2001:db8::1::2', 'unknown'],
    ['2001:db8:1:2:3:4:5:6:7', 'unknown'],
    ['2001:db8:zz::1', 'unknown'],
  ])('%s → %s', (ip, key) => {
    expect(clientKey(ip)).toBe(key);
  });

  it.each([
    ['203.0.113.7', '203.0.113.7'],
    ['unknown', 'unknown'],
  ])('%s is its own key', (ip, key) => {
    expect(clientKey(ip)).toBe(key);
  });

  it('addresses in one /64 share the limit; another /64 has its own', async () => {
    const { get } = setUp({
      providers: [fakeProvider('wiktionary', FOUND)],
      rateLimit: checkRateLimit,
    });

    for (let i = 0; i < RATE_LIMIT.requests; i++)
      await get(lookupPath('roof'), fromIp(`2001:db8:23:1::${String(i + 1)}`));

    expect((await get(lookupPath('roof'), fromIp('2001:db8:23:1:ffff::1'))).status).toBe(429);
    expect((await get(lookupPath('roof'), fromIp('2001:db8:23:2::1'))).status).toBe(200);
  });
});

describe('API-13: a limit other than RATE_LIMIT', () => {
  it('hit(now, limit) counts against that limit', async () => {
    const stub = env.RATE_LIMITER.get(env.RATE_LIMITER.idFromName('custom-limit'));
    const limit = { requests: 2, windowMs: 1000 };

    expect(await stub.hit(0, limit)).toEqual({ allowed: true });
    expect(await stub.hit(1, limit)).toEqual({ allowed: true });
    expect(await stub.hit(2, limit)).toEqual({ allowed: false, retryAfterSeconds: 1 });
    expect(await stub.hit(1000, limit)).toEqual({ allowed: true });
  });
});

describe('API-24: a budget for Wikimedia, shared by everyone', () => {
  it('is 50 uncached image lookups a minute', () => {
    expect(IMAGE_BUDGET).toEqual({ requests: 50, windowMs: 60_000 });
  });

  it('checkImageBudget is one limiter for everyone, with that budget', async () => {
    const verdicts = [];
    for (let i = 0; i < IMAGE_BUDGET.requests + 1; i++) verdicts.push(await checkImageBudget(env));

    expect(verdicts.filter(({ allowed }) => allowed)).toHaveLength(IMAGE_BUDGET.requests);
    expect(verdicts.at(-1)).toMatchObject({ allowed: false });
    const named = env.RATE_LIMITER.get(env.RATE_LIMITER.idFromName('wikimedia'));
    expect(await named.hit(Date.now(), IMAGE_BUDGET)).toMatchObject({ allowed: false });
  });

  it('an uncached image lookup asks the budget once; a cached one and definitions do not', async () => {
    const budget = fakeBudget({ allowed: true });
    const { get } = setUp({
      providers: [fakeProvider('wiktionary', FOUND)],
      images: fakeImages(IMAGES_FOUND).images,
      imageBudget: budget.imageBudget,
    });

    await get(lookupPath('architrave beam', 'both'));
    await get(lookupPath('architrave beam', 'image'));
    await get(lookupPath('architrave beam', 'definition'));

    expect(budget.asked()).toBe(1);
  });

  it('a spent budget fails the images without asking Wikimedia, and nothing is cached', async () => {
    const chain = fakeImages(IMAGES_FOUND);
    const { get, logs } = setUp({
      providers: [fakeProvider('wiktionary', FOUND)],
      images: chain.images,
      imageBudget: fakeBudget(SPENT).imageBudget,
    });

    const response = await get(lookupPath('keystone arch', 'both'));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      definition: { status: 'found' },
      images: { status: 'failed' },
    });
    expect(chain.calls).toEqual([]);
    expect(await caches.default.match(imagesCacheKey('keystone arch'))).toBeUndefined();
    expect(logs[0]?.images).toEqual({
      cache: 'miss',
      outcome: 'failed',
      reason: 'budget',
      ms: expect.any(Number) as number,
    });
  });

  it('kind=image with a spent budget is a 502, like any failed image lookup', async () => {
    const { get } = setUp({
      providers: [fakeProvider('wiktionary', FOUND)],
      imageBudget: fakeBudget(SPENT).imageBudget,
    });

    expect((await get(lookupPath('voussoir', 'image'))).status).toBe(502);
  });

  it('fails closed: a budget that cannot be checked fails the images', async () => {
    const chain = fakeImages(IMAGES_FOUND);
    const { get, logs } = setUp({
      providers: [fakeProvider('wiktionary', FOUND)],
      images: chain.images,
      imageBudget: fakeBudget('throws').imageBudget,
    });

    const response = await get(lookupPath('springer stone', 'both'));

    expect(await response.json()).toMatchObject({ images: { status: 'failed' } });
    expect(chain.calls).toEqual([]);
    expect(logs[0]?.images).toMatchObject({ outcome: 'failed', reason: 'budget-error' });
  });

  it('an allowed budget lets the lookup through', async () => {
    const chain = fakeImages(IMAGES_FOUND);
    const { get } = setUp({
      providers: [fakeProvider('wiktionary', FOUND)],
      images: chain.images,
      imageBudget: fakeBudget({ allowed: true }).imageBudget,
    });

    expect(await (await get(lookupPath('impost block', 'image'))).json()).toMatchObject({
      images: { status: 'found' },
    });
    expect(chain.calls).toEqual(['impost block']);
  });
});
