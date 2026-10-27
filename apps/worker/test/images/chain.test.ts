// Acceptance criteria IMG-14 and IMG-15 from docs/features/image-providers.md: merging the sources.
import type { LookupImage } from '@litsnap/shared';
import { describe, expect, it, vi } from 'vitest';
import { IMAGE_SOURCES, lookupImages } from '../../src/images/chain';
import { commonsImages } from '../../src/images/commonsImages';
import type { ImageOutcome, ImageSource } from '../../src/images/types';
import { wikipediaImages } from '../../src/images/wikipediaImages';
import { fakeFetch, json, networkError, status, type Reply } from '../fakeFetch';
import {
  category,
  categoryUrl,
  claims,
  details,
  detailsUrl,
  filePage,
  MEDIA_LIST,
  mediaItem,
  mediaList,
  SUMMARY,
  wikidataUrl,
  WP_HIP_ROOF,
} from '../fixtures/images';

const ARTICLE_URL = `${SUMMARY}hipped_roof`;

const image = (name: string): LookupImage => ({
  thumbUrl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${name}.jpg/330px-${name}.jpg`,
  fullUrl: `https://upload.wikimedia.org/wikipedia/commons/a/ab/${name}.jpg`,
  alt: name,
  title: name,
  mime: 'image/jpeg',
  width: 1000,
  height: 800,
  attribution: {
    author: 'Sample Author',
    licence: 'CC BY-SA 4.0',
    sourceName: 'Wikimedia Commons',
    sourceUrl: `https://commons.wikimedia.org/wiki/File:${name}.jpg`,
  },
});

const found = (...names: string[]): ImageOutcome => ({
  status: 'found',
  images: names.map((name) => image(name)),
});
const NOT_FOUND: ImageOutcome = { status: 'not-found' };
const FAILED: ImageOutcome = { status: 'failed', reason: 'HTTP 503' };

const source = (name: ImageSource['name'], outcome: ImageOutcome) => ({
  name,
  images: vi.fn((): Promise<ImageOutcome> => Promise.resolve(outcome)),
});

function run(wikipedia: ImageSource, commons: ImageSource, article: Reply = json(WP_HIP_ROOF)) {
  const fake = fakeFetch({ [ARTICLE_URL]: article });
  const context = { fetch: fake.fetch, timeoutMs: 1000 };
  return { context, outcome: lookupImages('hipped roof', context, [wikipedia, commons]) };
}

const titles = (outcome: ImageOutcome) =>
  outcome.status === 'found' ? outcome.images.map((one) => one.title) : outcome.status;

describe('IMG-14: article images first, then the category, at most 6', () => {
  it('the sources are the article, then its Commons category', () => {
    expect(IMAGE_SOURCES).toEqual([wikipediaImages, commonsImages]);
  });

  it("gives every source the article and keeps the sources' order", async () => {
    const wikipedia = source('wikipedia', found('A', 'B'));
    const commons = source('commons', found('C', 'D'));
    const { context, outcome } = run(wikipedia, commons);

    expect(titles(await outcome)).toEqual(['A', 'B', 'C', 'D']);
    expect(wikipedia.images).toHaveBeenCalledWith(
      { title: 'Hip roof', wikidataId: 'Q162034' },
      context,
    );
    expect(commons.images).toHaveBeenCalledWith(
      { title: 'Hip roof', wikidataId: 'Q162034' },
      context,
    );
  });

  it('drops a file that both sources found', async () => {
    const { outcome } = run(
      source('wikipedia', found('A', 'B')),
      source('commons', found('B', 'C')),
    );

    expect(titles(await outcome)).toEqual(['A', 'B', 'C']);
  });

  it('stops at 6', async () => {
    const { outcome } = run(
      source('wikipedia', found('A', 'B', 'C', 'D')),
      source('commons', found('E', 'F', 'G', 'H')),
    );

    expect(titles(await outcome)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });

  it('asks the sources at the same time', async () => {
    let finish: (outcome: ImageOutcome) => void = () => undefined;
    const wikipedia = {
      name: 'wikipedia' as const,
      images: vi.fn(() => new Promise<ImageOutcome>((resolve) => (finish = resolve))),
    };
    const commons = source('commons', found('C'));
    const { outcome } = run(wikipedia, commons);
    // If waiting below fails, nothing awaits `outcome`: don't let a rejection go unhandled.
    outcome.catch(() => undefined);

    // Commons is asked while Wikipedia hasn't answered yet.
    await vi.waitFor(() => {
      expect(commons.images).toHaveBeenCalled();
    });
    finish(found('A'));
    expect(titles(await outcome)).toEqual(['A', 'C']);
  });

  it('with the real sources: five requests, merged in order', async () => {
    const fake = fakeFetch({
      [ARTICLE_URL]: json(WP_HIP_ROOF),
      [`${MEDIA_LIST}Hip_roof`]: json(mediaList([mediaItem('File:Front_view.jpg')])),
      [detailsUrl(['File:Front view.jpg'])]: json(
        details([filePage({ title: 'File:Front view.jpg' })]),
      ),
      [wikidataUrl('Q162034')]: json(claims('Hipped roofs')),
      [categoryUrl('Hipped roofs')]: json(
        category([
          filePage({ title: 'File:Barn.jpg' }),
          filePage({ title: 'File:Front view.jpg' }),
        ]),
      ),
    });

    const outcome = await lookupImages('hipped roof', { fetch: fake.fetch, timeoutMs: 1000 });

    expect(titles(outcome)).toEqual(['Front view', 'Barn']);
    expect(fake.urls()).toHaveLength(5);
  });
});

describe('IMG-15: found, not found or failed', () => {
  it.each([
    ['not found', status(404), { status: 'not-found' }],
    ['failed', networkError, { status: 'failed' }],
  ])(
    'an article that is %s: so is the result, and no source is asked',
    async (_name, reply, expected) => {
      const wikipedia = source('wikipedia', found('A'));
      const commons = source('commons', found('B'));
      const { outcome } = run(wikipedia, commons, reply);

      expect(await outcome).toMatchObject(expected);
      expect(wikipedia.images).not.toHaveBeenCalled();
      expect(commons.images).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['article images, then a failed category', found('A', 'B', 'C'), FAILED],
    ['no article images, then a failed category', NOT_FOUND, FAILED],
    ['failed article images, then category images', FAILED, found('C')],
  ])('%s: failed', async (_name, wikipedia, commons) => {
    const { outcome } = run(source('wikipedia', wikipedia), source('commons', commons));

    expect(await outcome).toMatchObject({ status: 'failed' });
  });

  it('6 article images are found even when the category failed', async () => {
    const { outcome } = run(
      source('wikipedia', found('A', 'B', 'C', 'D', 'E', 'F')),
      source('commons', FAILED),
    );

    expect(titles(await outcome)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });

  it('category images alone are found', async () => {
    const { outcome } = run(source('wikipedia', NOT_FOUND), source('commons', found('C')));

    expect(titles(await outcome)).toEqual(['C']);
  });

  it('no images anywhere is not found', async () => {
    const { outcome } = run(source('wikipedia', NOT_FOUND), source('commons', NOT_FOUND));

    expect(await outcome).toEqual({ status: 'not-found' });
  });
});
