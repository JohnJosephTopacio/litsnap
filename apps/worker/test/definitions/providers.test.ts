// Acceptance criteria DEF-1…5 from docs/features/definition-providers.md: rules every provider follows.
import { describe, expect, it } from 'vitest';
import { dictionaryApi } from '../../src/definitions/dictionaryApi';
import { DEFAULT_TIMEOUT_MS, type DefinitionProvider } from '../../src/definitions/types';
import { wikipedia } from '../../src/definitions/wikipedia';
import { wiktionary } from '../../src/definitions/wiktionary';
import { fakeFetch, hang, json, networkError, status, text, type Reply } from '../fakeFetch';
import { DICTIONARY_API, WIKIPEDIA, WIKTIONARY } from '../fixtures/definitions';

/** Each provider with its URL for `hipped roof`, and a 200 body that isn't the shape it expects. */
const PROVIDERS: [string, DefinitionProvider, string, unknown][] = [
  ['wiktionary', wiktionary, `${WIKTIONARY}hipped_roof`, { en: 'not a list' }],
  ['dictionaryapi', dictionaryApi, `${DICTIONARY_API}hipped%20roof`, { title: 'not a list' }],
  ['wikipedia', wikipedia, `${WIKIPEDIA}hipped_roof`, { type: 'standard', title: 'Hip roof' }],
];

const lookUp = (provider: DefinitionProvider, url: string, reply: Reply, timeoutMs = 1000) => {
  const fake = fakeFetch({ [url]: reply });
  return {
    fake,
    outcome: provider.lookup('hipped roof', { fetch: fake.fetch, timeoutMs }),
  };
};

describe.each(PROVIDERS)('%s', (_name, provider, url, wrongShape) => {
  describe('DEF-1: providers never throw', () => {
    it.fails('a network error is a failure', async () => {
      const { outcome } = lookUp(provider, url, networkError);

      expect(await outcome).toMatchObject({ status: 'failed' });
    });
  });

  describe('DEF-2: requests identify us', () => {
    it.fails('sends our User-Agent and asks for JSON, at the documented URL', async () => {
      const { fake, outcome } = lookUp(provider, url, status(404));
      await outcome;

      expect(fake.urls()).toEqual([url]);
      expect(fake.requests[0]?.headers.get('User-Agent')).toBe(
        'LitSnap/1.0 (https://github.com/JohnJosephTopacio/litsnap)',
      );
      expect(fake.requests[0]?.headers.get('Accept')).toBe('application/json');
    });
  });

  describe('DEF-3: a slow source times out', () => {
    it.fails('aborts the request and fails', async () => {
      const { fake, outcome } = lookUp(provider, url, hang, 20);

      expect(await outcome).toMatchObject({ status: 'failed' });
      expect(fake.requests[0]?.signal?.aborted).toBe(true);
    });
  });

  describe('DEF-4: HTTP statuses', () => {
    it.fails('404 is not found', async () => {
      expect(await lookUp(provider, url, status(404)).outcome).toEqual({ status: 'not-found' });
    });

    it.fails.each([429, 500, 503])('%i is a failure', async (code) => {
      expect(await lookUp(provider, url, status(code)).outcome).toMatchObject({
        status: 'failed',
      });
    });

    it.fails('a body that is not JSON is a failure', async () => {
      expect(await lookUp(provider, url, text('<html>Oops</html>')).outcome).toMatchObject({
        status: 'failed',
      });
    });

    it.fails('JSON of the wrong shape is a failure', async () => {
      expect(await lookUp(provider, url, json(wrongShape)).outcome).toMatchObject({
        status: 'failed',
      });
    });
  });
});

describe('DEF-2: terms are percent-encoded', () => {
  it.fails.each([
    ['wiktionary', wiktionary, `${WIKTIONARY}caf%C3%A9_au_lait`],
    ['dictionaryapi', dictionaryApi, `${DICTIONARY_API}caf%C3%A9%20au%20lait`],
    ['wikipedia', wikipedia, `${WIKIPEDIA}caf%C3%A9_au_lait`],
  ] as const)('%s', async (_name, provider, url) => {
    const fake = fakeFetch({ [url]: status(404) });

    await provider.lookup('café au lait', { fetch: fake.fetch, timeoutMs: 1000 });

    expect(fake.urls()).toEqual([url]);
  });
});

describe('DEF-3: the production timeout', () => {
  it('is 3 seconds', () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(3000);
  });
});

describe('DEF-4: 400 from Wikimedia is an invalid title', () => {
  it.fails.each(PROVIDERS.filter(([, provider]) => provider !== dictionaryApi))(
    '%s: not found',
    async (_name, provider, url) => {
      expect(await lookUp(provider, url, status(400)).outcome).toEqual({ status: 'not-found' });
    },
  );

  it.fails('dictionaryapi.dev: 400 is a failure', async () => {
    const url = `${DICTIONARY_API}hipped%20roof`;
    expect(await lookUp(dictionaryApi, url, status(400)).outcome).toMatchObject({
      status: 'failed',
    });
  });
});

describe("DEF-5: terms that can't be page titles", () => {
  it.fails.each(
    [wiktionary, wikipedia].flatMap((provider) =>
      ['a#b', 'a<b', 'a>b', 'a[b', 'a]b', 'a{b', 'a}b', 'a|b'].map(
        (term) => [provider.name, provider, term] as const,
      ),
    ),
  )('%s: %j is not found without a request', async (_name, provider, term) => {
    const fake = fakeFetch({});

    const outcome = await provider.lookup(term, { fetch: fake.fetch, timeoutMs: 1000 });

    expect(outcome).toEqual({ status: 'not-found' });
    expect(fake.urls()).toEqual([]);
  });
});
