// Acceptance criteria DEF-1…5 from docs/features/definition-providers.md: rules every provider follows.
import { describe, expect, it } from 'vitest';
import { dictionaryApi } from '../../src/definitions/dictionaryApi';
import { DEFAULT_TIMEOUT_MS, type DefinitionProvider } from '../../src/definitions/types';
import { wikipedia } from '../../src/definitions/wikipedia';
import { wiktionary } from '../../src/definitions/wiktionary';
import { fakeFetch, hang, json, networkError, status, text, type Reply } from '../fakeFetch';
import {
  DICT_GABLE,
  DICTIONARY_API,
  WIKIPEDIA,
  WIKT_HIP_ROOF,
  WIKTIONARY,
  WP_HIP_ROOF,
} from '../fixtures/definitions';

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
    it('a network error is a failure', async () => {
      const { outcome } = lookUp(provider, url, networkError);

      expect(await outcome).toMatchObject({ status: 'failed' });
    });
  });

  describe('DEF-2: requests identify us', () => {
    it('sends our User-Agent and asks for JSON, at the documented URL', async () => {
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
    it('aborts the request and fails', async () => {
      const { fake, outcome } = lookUp(provider, url, hang, 20);

      expect(await outcome).toMatchObject({ status: 'failed' });
      expect(fake.requests[0]?.signal?.aborted).toBe(true);
    });
  });

  describe('DEF-4: HTTP statuses', () => {
    it('404 is not found', async () => {
      expect(await lookUp(provider, url, status(404)).outcome).toEqual({ status: 'not-found' });
    });

    it.each([429, 500, 503])('%i is a failure', async (code) => {
      expect(await lookUp(provider, url, status(code)).outcome).toMatchObject({
        status: 'failed',
      });
    });

    it('a body that is not JSON is a failure', async () => {
      expect(await lookUp(provider, url, text('<html>Oops</html>')).outcome).toMatchObject({
        status: 'failed',
      });
    });

    it('JSON of the wrong shape is a failure', async () => {
      expect(await lookUp(provider, url, json(wrongShape)).outcome).toMatchObject({
        status: 'failed',
      });
    });
  });
});

describe('DEF-2: terms are percent-encoded', () => {
  it.each([
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
  it.each(PROVIDERS.filter(([, provider]) => provider !== dictionaryApi))(
    '%s: not found',
    async (_name, provider, url) => {
      expect(await lookUp(provider, url, status(400)).outcome).toEqual({ status: 'not-found' });
    },
  );

  it('dictionaryapi.dev: 400 is a failure', async () => {
    const url = `${DICTIONARY_API}hipped%20roof`;
    expect(await lookUp(dictionaryApi, url, status(400)).outcome).toMatchObject({
      status: 'failed',
    });
  });
});

describe("DEF-5: terms that can't be page titles", () => {
  it.each(
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

// Added by the implementation PR's mutation checks.

describe('DEF-2: characters that mean something in a URL are encoded', () => {
  it.each([
    ['wiktionary', wiktionary, `${WIKTIONARY}who%3Fwhat`],
    ['dictionaryapi', dictionaryApi, `${DICTIONARY_API}who%3Fwhat`],
    ['wikipedia', wikipedia, `${WIKIPEDIA}who%3Fwhat`],
  ] as const)('%s', async (_name, provider, url) => {
    const fake = fakeFetch({ [url]: status(404) });

    await provider.lookup('who?what', { fetch: fake.fetch, timeoutMs: 1000 });

    expect(fake.urls()).toEqual([url]);
  });
});

describe('DEF-4: an error status fails even with a usable body', () => {
  it.each([
    ['wiktionary', wiktionary, `${WIKTIONARY}hip_roof`, WIKT_HIP_ROOF],
    ['dictionaryapi', dictionaryApi, `${DICTIONARY_API}hip%20roof`, DICT_GABLE],
    ['wikipedia', wikipedia, `${WIKIPEDIA}hip_roof`, WP_HIP_ROOF],
  ] as const)('%s', async (_name, provider, url, body) => {
    const fake = fakeFetch({ [url]: json(body, 500) });

    const outcome = await provider.lookup('hip roof', { fetch: fake.fetch, timeoutMs: 1000 });

    expect(outcome).toMatchObject({ status: 'failed' });
  });
});
