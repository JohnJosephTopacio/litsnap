// Acceptance criterion IMG-13 from docs/features/image-providers.md: the article's Commons category.
import { describe, expect, it } from 'vitest';
import { commonsImages } from '../../src/images/commonsImages';
import type { Article } from '../../src/images/types';
import { fakeFetch, json, type Reply } from '../fakeFetch';
import {
  category,
  categoryUrl,
  claims,
  EMPTY_CATEGORY,
  filePage,
  HIP_ROOF,
  wikidataUrl,
} from '../fixtures/images';

const WIKIDATA = wikidataUrl('Q162034');
const CATEGORY = categoryUrl('Hipped roofs');

function run(routes: Record<string, Reply>, article: Article = HIP_ROOF) {
  const fake = fakeFetch(routes);
  return { fake, outcome: commonsImages.images(article, { fetch: fake.fetch, timeoutMs: 1000 }) };
}

const titles = (outcome: Awaited<ReturnType<typeof commonsImages.images>>) =>
  outcome.status === 'found' ? outcome.images.map((image) => image.title) : outcome.status;

describe("IMG-13: the article's Commons category", () => {
  it('reads the category from Wikidata and asks Commons for its files', async () => {
    const { fake, outcome } = run({
      [WIKIDATA]: json(claims('Hipped roofs', 'Hip roofs (second claim)')),
      [CATEGORY]: json(category([filePage({ title: 'File:Barn.jpg' })])),
    });

    expect(titles(await outcome)).toEqual(['Barn']);
    expect(fake.urls()).toEqual([WIKIDATA, CATEGORY]);
  });

  it('keeps files sorted by title, drops the ones that may not be shown, at most 6', async () => {
    const names = ['Mill', 'Barn', 'Hut', 'Logo', 'Inn', 'Cabin', 'Farm', 'Dairy', 'Gate'];
    const pages = names.map((name) =>
      filePage({ title: `File:${name}.jpg`, meta: name === 'Logo' ? { License: 'gfdl' } : {} }),
    );
    const { outcome } = run({
      [WIKIDATA]: json(claims('Hipped roofs')),
      [CATEGORY]: json(category(pages)),
    });

    expect(titles(await outcome)).toEqual(['Barn', 'Cabin', 'Dairy', 'Farm', 'Gate', 'Hut']);
  });

  it('with no Wikidata item, it is not found without a request', async () => {
    const { fake, outcome } = run({}, { title: 'Roof plan' });

    expect(await outcome).toEqual({ status: 'not-found' });
    expect(fake.urls()).toEqual([]);
  });

  it('with no Commons category claim, it is not found without asking Commons', async () => {
    const { fake, outcome } = run({ [WIKIDATA]: json(claims()) });

    expect(await outcome).toEqual({ status: 'not-found' });
    expect(fake.urls()).toEqual([WIKIDATA]);
  });

  it('a category without files is not found', async () => {
    const { outcome } = run({
      [WIKIDATA]: json(claims('Hipped roofs')),
      [CATEGORY]: json(EMPTY_CATEGORY),
    });

    expect(await outcome).toEqual({ status: 'not-found' });
  });

  it('a category whose files may not be shown is not found', async () => {
    const { outcome } = run({
      [WIKIDATA]: json(claims('Hipped roofs')),
      [CATEGORY]: json(category([filePage({ title: 'File:Clip.webm', mime: 'video/webm' })])),
    });

    expect(await outcome).toEqual({ status: 'not-found' });
  });
});
