// CLIENT-12 (docs/features/lookup-client.md) for images (docs/features/image-providers.md): the real
// Wikipedia, Wikidata and Commons still answer the way our parsers expect, and thumbnails on
// upload.wikimedia.org can still be fetched from our page (CORS), which decision 0005 relies on.
// Uses the network, so it's not part of `pnpm test`: run `pnpm --filter @litsnap/worker test:live`.
import type { LookupImage } from '@litsnap/shared';
import { describe, expect, it } from 'vitest';
import { USER_AGENT } from '../src/definitions/http';
import { DEFAULT_TIMEOUT_MS, type ProviderContext } from '../src/definitions/types';
import { lookupImages } from '../src/images/chain';
import { commonsImages } from '../src/images/commonsImages';
import { DETAILS_TIMEOUT_MS } from '../src/images/types';
import { wikipediaImages } from '../src/images/wikipediaImages';

// Production's timeouts: a 10 s allowance once hid that file details took longer than 3 s (#41).
const context: ProviderContext = {
  fetch: (input, init) => fetch(input, init),
  timeoutMs: DEFAULT_TIMEOUT_MS,
  detailsTimeoutMs: DETAILS_TIMEOUT_MS,
};

const HIP_ROOF = { title: 'Hip roof', wikidataId: 'Q162034' };

/** Every image is credited, described and on the host the browser may fetch from (IMG-6…11). */
function expectUsable(images: LookupImage[]) {
  for (const image of images) {
    expect(image.thumbUrl).toMatch(/^https:\/\/upload\.wikimedia\.org\/wikipedia\//);
    expect(image.fullUrl).toMatch(/^https:\/\/upload\.wikimedia\.org\/wikipedia\//);
    expect(image.alt).not.toBe('');
    expect(image.attribution.author).not.toBe('');
    expect(image.attribution.licence).not.toBe('');
  }
}

async function found(outcome: Promise<{ status: string; images?: LookupImage[] }>) {
  const result = await outcome;
  expect(result.status).toBe('found');
  return result.images ?? [];
}

describe('live image sources', () => {
  it("Wikipedia's media-list and file details give hip roof's gallery images", async () => {
    const images = await found(wikipediaImages.images(HIP_ROOF, context));

    expect(images.length).toBeGreaterThanOrEqual(3);
    expectUsable(images);
  });

  it("Wikidata and Commons give the hip roof article's category files", async () => {
    const images = await found(commonsImages.images(HIP_ROOF, context));

    expect(images.length).toBeGreaterThanOrEqual(3);
    expectUsable(images);
  });

  it('the chain fills the grid for hipped roof', async () => {
    const images = await found(lookupImages('hipped roof', context));

    expect(images).toHaveLength(6);
  });

  it('a 330 px thumbnail on upload.wikimedia.org is an image that any page may fetch', async () => {
    const [image] = await found(wikipediaImages.images(HIP_ROOF, context));
    expect(image?.thumbUrl).toMatch(/\/330px-/);

    const response = await fetch(image?.thumbUrl ?? '', {
      headers: { 'User-Agent': USER_AGENT, Origin: 'https://litsnap.pages.dev' },
    });
    await response.body?.cancel();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toMatch(/^image\//);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});
