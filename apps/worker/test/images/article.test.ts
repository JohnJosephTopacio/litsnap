// Acceptance criterion IMG-5 from docs/features/image-providers.md: the article, by its exact title.
import { describe, expect, it } from 'vitest';
import { findArticle } from '../../src/images/article';
import { fakeFetch, json } from '../fakeFetch';
import {
  SUMMARY,
  WP_BASS,
  WP_HIP_ROOF,
  WP_NO_EXTRACT,
  WP_NO_WIKIDATA,
  WP_ODD_WIKIDATA,
} from '../fixtures/images';

async function find(term: string, body: unknown) {
  const fake = fakeFetch({ [SUMMARY + term.replaceAll(' ', '_')]: json(body) });
  return findArticle(term, { fetch: fake.fetch, timeoutMs: 1000 });
}

describe('IMG-5: the exact title, as for definitions', () => {
  it("follows the redirect to the article's title, with its Wikidata item", async () => {
    expect(await find('hipped roof', WP_HIP_ROOF)).toEqual({
      status: 'found',
      article: { title: 'Hip roof', wikidataId: 'Q162034' },
    });
  });

  it.each([
    ['no Wikidata item', WP_NO_WIKIDATA],
    ['an item that is not a Q-number', WP_ODD_WIKIDATA],
  ])('with %s, the article has no wikidataId', async (_name, body) => {
    expect(await find('roof plan', body)).toEqual({
      status: 'found',
      article: { title: 'Roof plan' },
    });
  });

  it.each([
    ['a disambiguation page', 'bass', WP_BASS],
    ['a page with no extract', 'roof plan', WP_NO_EXTRACT],
  ])('%s is not found', async (_name, term, body) => {
    expect(await find(term, body)).toEqual({ status: 'not-found' });
  });

  it.each(['a#b', 'a<b', 'a>b', 'a[b', 'a]b', 'a{b', 'a}b', 'a|b'])(
    '%j is not found without a request',
    async (term) => {
      const fake = fakeFetch({});

      expect(await findArticle(term, { fetch: fake.fetch, timeoutMs: 1000 })).toEqual({
        status: 'not-found',
      });
      expect(fake.urls()).toEqual([]);
    },
  );
});
