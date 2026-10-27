// Acceptance criteria API-1…11, 15, 16 from docs/features/lookup-api.md. Rate limit: rateLimit.test.ts.
import { describe, expect, it } from 'vitest';
import { definitionCacheKey, FOUND_TTL_SECONDS, NOT_FOUND_TTL_SECONDS } from '../../src/cache';
import {
  FAILED,
  fakeProvider,
  FOUND,
  FOUND_DICTIONARY,
  lookupPath,
  NOT_FOUND,
  setUp,
} from './support';

const CACHE = 'https://lookup-cache.invalid/v1/definition/';

/** The app with one fake Wiktionary that answers `outcome`. */
function withWiktionary(outcome = FOUND) {
  const wiktionary = fakeProvider('wiktionary', outcome);
  return { wiktionary, ...setUp({ providers: [wiktionary] }) };
}

describe('API-1: a lookup', () => {
  it('answers 200 with the LookupResult as JSON', async () => {
    const { get } = withWiktionary();

    const response = await get('/lookup?term=roof&kind=definition');

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toMatch(/^application\/json/);
    expect(await response.json()).toEqual({
      term: 'roof',
      definition: { status: 'found', ...FOUND_DICTIONARY },
    });
  });
});

describe('API-2: the Worker normalises again', () => {
  it('looks up and returns the normalised term', async () => {
    const { get, wiktionary } = withWiktionary();

    const response = await get(lookupPath('Hipped-Roof,'));

    expect(wiktionary.calls).toEqual(['hipped roof']);
    expect(await response.json()).toMatchObject({ term: 'hipped roof' });
  });
});

describe('API-3: invalid requests', () => {
  it.each([
    ['no term', '/lookup?kind=definition'],
    ['a term that normalises to nothing', lookupPath('—')],
    ['7 words', lookupPath('one two three four five six seven')],
    ['101 characters', lookupPath('a'.repeat(101))],
    ['no kind', '/lookup?term=roof'],
    ['an unknown kind', '/lookup?term=roof&kind=pictures'],
  ])('%s: 400, and no provider is asked', async (_name, path) => {
    const { get, wiktionary } = withWiktionary();

    const response = await get(path);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid-request' });
    expect(wiktionary.calls).toEqual([]);
  });

  it.each([
    ['6 words', 'one two three four five six'],
    ['100 characters', 'a'.repeat(100)],
  ])('%s is allowed', async (_name, term) => {
    const { get } = withWiktionary();

    expect((await get(lookupPath(term))).status).toBe(200);
  });

  it('the limit is 100 characters', async () => {
    const { MAX_TERM_LENGTH } = await import('../../src/app');
    expect(MAX_TERM_LENGTH).toBe(100);
  });
});

describe('API-4: sections by kind', () => {
  it('definition', async () => {
    const { get } = withWiktionary();

    expect(Object.keys(await (await get(lookupPath('roof', 'definition'))).json())).toEqual([
      'term',
      'definition',
    ]);
  });

  it('image: images are not found until M4, and no definition provider is asked', async () => {
    const { get, wiktionary } = withWiktionary();

    expect(await (await get(lookupPath('roof', 'image'))).json()).toEqual({
      term: 'roof',
      images: { status: 'not-found' },
    });
    expect(wiktionary.calls).toEqual([]);
  });

  it('both', async () => {
    const { get } = withWiktionary();

    expect(await (await get(lookupPath('roof', 'both'))).json()).toEqual({
      term: 'roof',
      definition: { status: 'found', ...FOUND_DICTIONARY },
      images: { status: 'not-found' },
    });
  });
});

describe('API-5: upstream failure', () => {
  // Terms no other test caches: a cached definition would be a 200.
  it.each([
    ['definition', 'purlin'],
    ['both', 'rafter'],
  ])('kind=%s: 502', async (kind, term) => {
    const { get } = withWiktionary(FAILED);

    const response = await get(lookupPath(term, kind));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'upstream-failed' });
  });

  it('kind=image never asks, so never fails', async () => {
    const { get } = withWiktionary(FAILED);

    expect((await get(lookupPath('roof', 'image'))).status).toBe(200);
  });
});

describe('API-6: only GET /lookup', () => {
  it('POST /lookup and unknown paths are 404; /health still answers', async () => {
    const { get, send } = withWiktionary();

    const post = await send(
      new Request(`https://worker.test${lookupPath('roof')}`, { method: 'POST' }),
    );
    expect(post.status).toBe(404);
    expect((await get('/nope')).status).toBe(404);
    expect(await (await get('/health')).json()).toEqual({
      status: 'ok',
      service: 'litsnap-worker',
    });
  });
});

describe('API-7: found definitions are cached for 30 days', () => {
  it('stores the definition section, and the next lookup asks no provider', async () => {
    const { get, wiktionary } = withWiktionary();

    const first = await (await get(lookupPath('eaves'))).json();
    const stored = await caches.default.match(`${CACHE}eaves`);
    const second = await (await get(lookupPath('eaves'))).json();

    expect(stored?.headers.get('Cache-Control')).toBe('max-age=2592000');
    expect(await stored?.json()).toEqual({ status: 'found', ...FOUND_DICTIONARY });
    expect(second).toEqual(first);
    expect(wiktionary.calls).toEqual(['eaves']);
  });

  it('30 days is 2,592,000 seconds', () => {
    expect(FOUND_TTL_SECONDS).toBe(2_592_000);
  });
});

describe('API-8: not-found definitions are cached for 1 day', () => {
  it('stores not-found for a day', async () => {
    const { get, wiktionary } = withWiktionary(NOT_FOUND);

    await get(lookupPath('xyzzy'));
    const stored = await caches.default.match(`${CACHE}xyzzy`);
    await get(lookupPath('xyzzy'));

    expect(stored?.headers.get('Cache-Control')).toBe('max-age=86400');
    expect(await stored?.json()).toEqual({ status: 'not-found' });
    expect(wiktionary.calls).toEqual(['xyzzy']);
  });

  it('1 day is 86,400 seconds', () => {
    expect(NOT_FOUND_TTL_SECONDS).toBe(86_400);
  });
});

describe('API-9: failures are never cached', () => {
  it('stores nothing, and asks again next time', async () => {
    const { get, wiktionary } = withWiktionary(FAILED);

    expect((await get(lookupPath('soffit'))).status).toBe(502);
    expect(await caches.default.match(`${CACHE}soffit`)).toBeUndefined();
    await get(lookupPath('soffit'));

    expect(wiktionary.calls).toEqual(['soffit', 'soffit']);
  });
});

describe('API-10: the cache key', () => {
  it('is the normalised term under v1/definition', () => {
    expect(definitionCacheKey('hipped roof')).toBe(`${CACHE}hipped%20roof`);
  });

  it('a different spelling of the same term, or kind=both, is a cache hit', async () => {
    const { get, wiktionary } = withWiktionary();

    await get(lookupPath('flying buttress'));
    await get(lookupPath('Flying-Buttress,'));
    const both = await (await get(lookupPath('flying buttress', 'both'))).json();

    expect(wiktionary.calls).toEqual(['flying buttress']);
    expect(both).toMatchObject({ definition: { status: 'found' } });
  });
});

describe('API-11: browser caching', () => {
  it('a 200 may be kept for a day', async () => {
    const { get } = withWiktionary();

    expect((await get(lookupPath('gable'))).headers.get('Cache-Control')).toBe(
      'public, max-age=86400',
    );
  });

  it.each([
    ['400', '/lookup?term=roof', FOUND],
    ['502', lookupPath('dormer'), FAILED],
  ])('a %s is not stored', async (_name, path, outcome) => {
    const { get } = withWiktionary(outcome);

    expect((await get(path)).headers.get('Cache-Control')).toBe('no-store');
  });
});

describe('API-15: only our pages may read responses', () => {
  it.each(['https://litsnap.pages.dev', 'http://localhost:5173', 'http://localhost:4173'])(
    '%s may, errors included',
    async (origin) => {
      const { get } = withWiktionary();

      for (const path of [lookupPath('roof'), '/lookup?term=roof']) {
        const response = await get(path, { Origin: origin });
        expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
        expect(response.headers.get('Vary')).toMatch(/Origin/);
      }
    },
  );

  it.each([
    ['another site', { Origin: 'https://example.com' }],
    ['no Origin (curl)', {}],
  ])('%s gets the answer, but no Access-Control-Allow-Origin', async (_name, headers) => {
    const { get } = withWiktionary();

    const response = await get(lookupPath('roof'), headers);

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('API-16: one log line per lookup, without the term or the IP', () => {
  it('a lookup that asked the providers', async () => {
    const dictionary = fakeProvider('dictionaryapi', FOUND);
    const { get, logs } = setUp({ providers: [fakeProvider('wiktionary', FAILED), dictionary] });

    await get(lookupPath('cornice'));

    expect(logs).toEqual([
      {
        route: 'lookup',
        status: 200,
        kind: 'definition',
        cache: 'miss',
        rateLimit: 'allowed',
        ms: expect.any(Number) as number,
        providers: [
          {
            name: 'wiktionary',
            outcome: 'failed',
            reason: 'HTTP 500',
            ms: expect.any(Number) as number,
          },
          { name: 'dictionaryapi', outcome: 'found', ms: expect.any(Number) as number },
        ],
      },
    ]);
  });

  it('a cache hit asks no provider', async () => {
    const { get, logs } = withWiktionary();

    await get(lookupPath('lintel'));
    await get(lookupPath('lintel'));

    expect(logs[1]).toMatchObject({ status: 200, cache: 'hit', providers: [] });
  });

  it.each([
    ['an invalid request', '/lookup?term=roof', { status: 400, cache: 'none' }],
    ['kind=image', lookupPath('roof', 'image'), { status: 200, kind: 'image', cache: 'none' }],
  ])('%s needs no definition', async (_name, path, expected) => {
    const { get, logs } = withWiktionary();

    await get(path);

    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ ...expected, providers: [] });
    if (!('kind' in expected)) expect(logs[0]).not.toHaveProperty('kind');
  });

  it('never contains the term, the selection or the IP', async () => {
    const { get, logs } = withWiktionary(FAILED);

    await get(lookupPath('Hipped-Roof,'), { 'CF-Connecting-IP': '203.0.113.7' });
    await get(lookupPath('hipped roof', 'both'), { 'CF-Connecting-IP': '203.0.113.7' });

    expect(logs).toHaveLength(2);
    const logged = JSON.stringify(logs).toLowerCase();
    for (const secret of ['hipped', 'roof', '203.0.113.7']) expect(logged).not.toContain(secret);
  });
});
