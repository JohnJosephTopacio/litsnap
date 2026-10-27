// Acceptance criteria API-17…22 from docs/features/lookup-api.md: images in /lookup (M4).
// `caches.default` keeps entries across tests, so every test uses its own term.
import { describe, expect, it } from 'vitest';
import { FOUND_TTL_SECONDS, imagesCacheKey, NOT_FOUND_TTL_SECONDS } from '../../src/cache';
import type { ImageOutcome } from '../../src/images/types';
import {
  FAILED,
  fakeImages,
  fakeProvider,
  FOUND,
  FOUND_DICTIONARY,
  IMAGE,
  IMAGES_FAILED,
  IMAGES_FOUND,
  IMAGES_NOT_FOUND,
  lookupPath,
  setUp,
} from './support';
import type { ProviderOutcome } from '../../src/definitions/types';

/** The app with one fake Wiktionary and a fake image chain. */
function withSections(definition: ProviderOutcome, images: ImageOutcome) {
  const wiktionary = fakeProvider('wiktionary', definition);
  const chain = fakeImages(images);
  return { wiktionary, chain, ...setUp({ providers: [wiktionary], images: chain.images }) };
}

describe('API-17: the images section', () => {
  it.fails(
    'kind=image: the chain is asked for the normalised term, with the usual context',
    async () => {
      const { get, chain } = withSections(FOUND, IMAGES_FOUND);

      const response = await get(lookupPath('Eave,', 'image'));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        term: 'eave',
        images: { status: 'found', images: [IMAGE] },
      });
      expect(chain.calls).toEqual(['eave']);
      expect(chain.contexts[0]?.timeoutMs).toBe(3000);
    },
  );

  it.fails('kind=both: not found is a section too', async () => {
    const { get, chain } = withSections(FOUND, IMAGES_NOT_FOUND);

    expect(await (await get(lookupPath('gutter', 'both'))).json()).toEqual({
      term: 'gutter',
      definition: { status: 'found', ...FOUND_DICTIONARY },
      images: { status: 'not-found' },
    });
    expect(chain.calls).toEqual(['gutter']);
  });

  it('kind=definition: the image chain is not asked', async () => {
    const { get, chain } = withSections(FOUND, IMAGES_FOUND);

    expect(await (await get(lookupPath('finial', 'definition'))).json()).not.toHaveProperty(
      'images',
    );
    expect(chain.calls).toEqual([]);
  });
});

describe('API-18: one section can fail while the other is shown', () => {
  it.fails('a failed definition next to found images is a 200', async () => {
    const { get } = withSections(FAILED, IMAGES_FOUND);

    const response = await get(lookupPath('corbel', 'both'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      term: 'corbel',
      definition: { status: 'failed' },
      images: { status: 'found', images: [IMAGE] },
    });
  });

  it.fails('failed images next to a found definition are a 200', async () => {
    const { get } = withSections(FOUND, IMAGES_FAILED);

    const response = await get(lookupPath('quoin', 'both'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      term: 'quoin',
      definition: { status: 'found', ...FOUND_DICTIONARY },
      images: { status: 'failed' },
    });
  });

  it('both failed is a 502', async () => {
    const { get } = withSections(FAILED, IMAGES_FAILED);

    const response = await get(lookupPath('plinth', 'both'));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'upstream-failed' });
  });

  it.fails('kind=image with failed images is a 502', async () => {
    const { get } = withSections(FOUND, IMAGES_FAILED);

    const response = await get(lookupPath('parapet', 'image'));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'upstream-failed' });
  });
});

describe('API-19: both sections are looked up at the same time', () => {
  it.fails('each chain is asked while the other is still working', async () => {
    // Each side waits for the other to have started. One after the other, the first would give up.
    let definitionStarted: () => void = () => undefined;
    let imagesStarted: () => void = () => undefined;
    const started = {
      definition: new Promise<void>((resolve) => (definitionStarted = resolve)),
      images: new Promise<void>((resolve) => (imagesStarted = resolve)),
    };
    const giveUp = () =>
      new Promise<'gave up'>((resolve) => {
        setTimeout(() => {
          resolve('gave up');
        }, 500);
      });
    const wiktionary = {
      name: 'wiktionary' as const,
      async lookup(): Promise<ProviderOutcome> {
        definitionStarted();
        return (await Promise.race([started.images, giveUp()])) === 'gave up' ? FAILED : FOUND;
      },
    };
    const chain = fakeImages(async () => {
      imagesStarted();
      return (await Promise.race([started.definition, giveUp()])) === 'gave up'
        ? IMAGES_FAILED
        : IMAGES_FOUND;
    });
    const { get } = setUp({ providers: [wiktionary], images: chain.images });

    expect(await (await get(lookupPath('cupola', 'both'))).json()).toMatchObject({
      definition: { status: 'found' },
      images: { status: 'found' },
    });
  });
});

describe('API-20: images are cached like definitions', () => {
  it('the key is the normalised term under v1/images', () => {
    expect(imagesCacheKey('hipped roof')).toBe(
      'https://lookup-cache.invalid/v1/images/hipped%20roof',
    );
  });

  it.fails('found images are stored for 30 days, and the next lookup asks no chain', async () => {
    const { get, chain } = withSections(FOUND, IMAGES_FOUND);

    await get(lookupPath('mansard', 'image'));
    const cached = await caches.default.match(imagesCacheKey('mansard'));
    await get(lookupPath('Mansard!', 'image'));

    expect(cached?.headers.get('Cache-Control')).toBe(`max-age=${String(FOUND_TTL_SECONDS)}`);
    expect(await cached?.json()).toEqual({ status: 'found', images: [IMAGE] });
    expect(chain.calls).toEqual(['mansard']);
  });

  it.fails('not-found images are stored for 1 day', async () => {
    const { get } = withSections(FOUND, IMAGES_NOT_FOUND);

    await get(lookupPath('gambrel', 'image'));
    const cached = await caches.default.match(imagesCacheKey('gambrel'));

    expect(cached?.headers.get('Cache-Control')).toBe(`max-age=${String(NOT_FOUND_TTL_SECONDS)}`);
    expect(await cached?.json()).toEqual({ status: 'not-found' });
  });

  it.fails('failed images are not stored, and the chain is asked again', async () => {
    const { get, chain } = withSections(FOUND, IMAGES_FAILED);

    await get(lookupPath('truss', 'both'));
    await get(lookupPath('truss', 'both'));

    expect(await caches.default.match(imagesCacheKey('truss'))).toBeUndefined();
    expect(chain.calls).toEqual(['truss', 'truss']);
  });

  it.fails('kind=image and kind=both share the entry', async () => {
    const { get, chain } = withSections(FOUND, IMAGES_FOUND);

    await get(lookupPath('joist', 'image'));
    const both = await (await get(lookupPath('joist', 'both'))).json();

    expect(chain.calls).toEqual(['joist']);
    expect(both).toMatchObject({ images: { status: 'found' } });
  });

  it.fails('the definition and images entries are independent', async () => {
    const { get, chain, wiktionary } = withSections(FOUND, IMAGES_FOUND);

    await get(lookupPath('pediment', 'definition'));
    await get(lookupPath('pediment', 'both'));

    expect(wiktionary.calls).toEqual(['pediment']);
    expect(chain.calls).toEqual(['pediment']);
  });
});

describe("API-21: a partial answer isn't kept by the browser", () => {
  it.fails.each([
    ['a failed definition', FAILED, IMAGES_FOUND, 'architrave'],
    ['failed images', FOUND, IMAGES_FAILED, 'transom'],
  ])('a 200 with %s is not stored', async (_name, definition, images, term) => {
    const { get } = withSections(definition, images);

    const response = await get(lookupPath(term, 'both'));

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('a 200 with every section looked up may still be kept for a day', async () => {
    const { get } = withSections(FOUND, IMAGES_NOT_FOUND);

    expect((await get(lookupPath('mullion', 'both'))).headers.get('Cache-Control')).toBe(
      'public, max-age=86400',
    );
  });
});

describe('API-22: logs say how the images went, without the term', () => {
  it.fails('a miss records the outcome, the reason and the time', async () => {
    const { get, logs } = withSections(FOUND, IMAGES_FAILED);

    await get(lookupPath('lantern', 'image'));

    expect(logs[0]).toMatchObject({ status: 502, kind: 'image', cache: 'none' });
    expect(logs[0]?.images).toEqual({
      cache: 'miss',
      outcome: 'failed',
      reason: 'commons: HTTP 503',
      ms: expect.any(Number) as number,
    });
  });

  it.fails('a hit records the cached outcome', async () => {
    const { get, logs } = withSections(FOUND, IMAGES_FOUND);

    await get(lookupPath('spire', 'both'));
    await get(lookupPath('spire', 'both'));

    expect(logs[0]?.images).toEqual({
      cache: 'miss',
      outcome: 'found',
      ms: expect.any(Number) as number,
    });
    expect(logs[1]?.images).toEqual({
      cache: 'hit',
      outcome: 'found',
      ms: expect.any(Number) as number,
    });
  });

  it.each([
    ['kind=definition', lookupPath('belfry', 'definition')],
    ['an invalid request', '/lookup?term=belfry'],
  ])('%s logs no images', async (_name, path) => {
    const { get, logs } = withSections(FOUND, IMAGES_FOUND);

    await get(path);

    expect(logs[0]).not.toHaveProperty('images');
  });

  it('never contains the term, the selection or the IP', async () => {
    const { get, logs } = withSections(FAILED, IMAGES_FAILED);

    await get(lookupPath('Flying-Buttress,', 'both'), { 'CF-Connecting-IP': '203.0.113.9' });
    await get(lookupPath('flying buttress', 'image'), { 'CF-Connecting-IP': '203.0.113.9' });

    const logged = JSON.stringify(logs).toLowerCase();
    for (const secret of ['flying', 'buttress', '203.0.113.9'])
      expect(logged).not.toContain(secret);
  });
});
