// Acceptance criterion IMG-12 from docs/features/image-providers.md: the article's gallery images.
import { describe, expect, it } from 'vitest';
import { wikipediaImages } from '../../src/images/wikipediaImages';
import { fakeFetch, json } from '../fakeFetch';
import {
  details,
  detailsUrl,
  filePage,
  HIP_ROOF,
  MEDIA_LIST,
  mediaItem,
  mediaList,
  missingPage,
} from '../fixtures/images';

const LIST_URL = `${MEDIA_LIST}Hip_roof`;

function run(items: unknown[], detailsFor: string[], pages: unknown[]) {
  const fake = fakeFetch({
    [LIST_URL]: json(mediaList(items)),
    [detailsUrl(detailsFor)]: json(details(pages)),
  });
  return {
    fake,
    outcome: wikipediaImages.images(HIP_ROOF, { fetch: fake.fetch, timeoutMs: 1000 }),
  };
}

const titles = (outcome: Awaited<ReturnType<typeof wikipediaImages.images>>) =>
  outcome.status === 'found' ? outcome.images.map((image) => image.title) : outcome.status;

describe('IMG-12: gallery images, in article order', () => {
  it.fails('takes gallery images only, and asks for their details in one request', async () => {
    const { fake, outcome } = run(
      [
        mediaItem('File:Front_view.jpg', { leadImage: true }),
        mediaItem('File:Roof_walk.webm', { type: 'video' }),
        mediaItem('File:Site_icon.png', { showInGallery: false }),
        mediaItem('File:Side_view.jpg'),
      ],
      ['File:Front view.jpg', 'File:Side view.jpg'],
      [filePage({ title: 'File:Front view.jpg' }), filePage({ title: 'File:Side view.jpg' })],
    );

    expect(titles(await outcome)).toEqual(['Front view', 'Side view']);
    expect(fake.urls()).toEqual([
      LIST_URL,
      detailsUrl(['File:Front view.jpg', 'File:Side view.jpg']),
    ]);
  });

  it.fails("keeps the article's order, not the response's", async () => {
    const { outcome } = run(
      [mediaItem('File:Zinc_roof.jpg'), mediaItem('File:Attic.jpg'), mediaItem('File:Mill.jpg')],
      ['File:Zinc roof.jpg', 'File:Attic.jpg', 'File:Mill.jpg'],
      [
        filePage({ title: 'File:Attic.jpg' }),
        filePage({ title: 'File:Mill.jpg' }),
        filePage({ title: 'File:Zinc roof.jpg' }),
      ],
    );

    expect(titles(await outcome)).toEqual(['Zinc roof', 'Attic', 'Mill']);
  });

  it.fails("passes each item's caption for the alt text", async () => {
    const { outcome } = run(
      [mediaItem('File:Front_view.jpg', { caption: 'The front, from the street' })],
      ['File:Front view.jpg'],
      [filePage({ title: 'File:Front view.jpg' })],
    );

    const result = await outcome;
    expect(result.status === 'found' && result.images[0]?.alt).toBe('The front, from the street');
  });

  it.fails('drops missing files and files that may not be shown', async () => {
    const { outcome } = run(
      [mediaItem('File:Gone.jpg'), mediaItem('File:Logo.png'), mediaItem('File:Side_view.jpg')],
      ['File:Gone.jpg', 'File:Logo.png', 'File:Side view.jpg'],
      [
        missingPage('File:Gone.jpg'),
        filePage({ title: 'File:Logo.png', wiki: 'en', meta: { NonFree: 'true' } }),
        filePage({ title: 'File:Side view.jpg' }),
      ],
    );

    expect(titles(await outcome)).toEqual(['Side view']);
  });

  it.fails('asks about the first 20 gallery images and finds at most 6', async () => {
    const files = Array.from({ length: 25 }, (_, i) => `File:View_${String(i + 1)}.jpg`);
    const asked = files.slice(0, 20).map((file) => file.replaceAll('_', ' '));
    const { outcome } = run(
      files.map((file) => mediaItem(file)),
      asked,
      asked.map((title) => filePage({ title })),
    );

    expect(titles(await outcome)).toEqual([
      'View 1',
      'View 2',
      'View 3',
      'View 4',
      'View 5',
      'View 6',
    ]);
  });

  it.fails('none usable is not found', async () => {
    const { outcome } = run(
      [mediaItem('File:Logo.png')],
      ['File:Logo.png'],
      [filePage({ title: 'File:Logo.png', meta: { License: 'gfdl' } })],
    );

    expect(await outcome).toEqual({ status: 'not-found' });
  });

  it.fails('no gallery items is not found, without the details request', async () => {
    const fake = fakeFetch({
      [LIST_URL]: json(mediaList([mediaItem('File:Walk.webm', { type: 'video' })])),
    });

    const outcome = await wikipediaImages.images(HIP_ROOF, { fetch: fake.fetch, timeoutMs: 1000 });

    expect(outcome).toEqual({ status: 'not-found' });
    expect(fake.urls()).toEqual([LIST_URL]);
  });
});
