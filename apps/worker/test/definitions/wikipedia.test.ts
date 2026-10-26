// Acceptance criteria DEF-15 and DEF-16 from docs/features/definition-providers.md.
import { describe, expect, it } from 'vitest';
import { wikipedia } from '../../src/definitions/wikipedia';
import { fakeFetch, json } from '../fakeFetch';
import {
  CC_BY_SA_4,
  WIKIPEDIA,
  WP_BASS,
  WP_EMPTY_EXTRACT,
  WP_HIP_ROOF,
  WP_NO_EXTRACT,
} from '../fixtures/definitions';

async function lookUp(title: string, body: unknown) {
  const fake = fakeFetch({ [WIKIPEDIA + title]: json(body) });
  return wikipedia.lookup(title.replaceAll('_', ' '), { fetch: fake.fetch, timeoutMs: 1000 });
}

describe('DEF-15: article summary', () => {
  it.fails("uses the redirect target's title, plain-text extract and page", async () => {
    expect(await lookUp('hipped_roof', WP_HIP_ROOF)).toEqual({
      status: 'found',
      definition: {
        from: 'wikipedia',
        title: 'Hip roof',
        summary: WP_HIP_ROOF.extract,
        source: {
          sourceName: 'Wikipedia',
          sourceUrl: 'https://en.wikipedia.org/wiki/Hip_roof',
          ...CC_BY_SA_4,
        },
      },
    });
  });
});

describe('DEF-16: no usable summary', () => {
  it.fails.each([
    ['a disambiguation page', 'bass', WP_BASS],
    ['no extract', 'roof_plan', WP_NO_EXTRACT],
    ['an empty extract', 'roof_plan', WP_EMPTY_EXTRACT],
  ])('%s is not found', async (_name, title, body) => {
    expect(await lookUp(title, body)).toEqual({ status: 'not-found' });
  });
});
