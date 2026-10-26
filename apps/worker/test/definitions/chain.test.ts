// Acceptance criteria DEF-17…19 from docs/features/definition-providers.md.
import { describe, expect, it } from 'vitest';
import { lookupDefinition } from '../../src/definitions/chain';
import type {
  DefinitionProvider,
  ProviderContext,
  ProviderOutcome,
} from '../../src/definitions/types';
import { fakeFetch, json, status, type Reply } from '../fakeFetch';
import {
  DICT_GABLE,
  DICT_GABLE_DEFINITION,
  DICTIONARY_API,
  WIKIPEDIA,
  WIKT_ROOF,
  WIKTIONARY,
  WP_HIP_ROOF,
} from '../fixtures/definitions';

const NOT_FOUND: ProviderOutcome = { status: 'not-found' };
const FAILED: ProviderOutcome = { status: 'failed', reason: 'test' };
const FOUND: ProviderOutcome = {
  status: 'found',
  definition: {
    from: 'wikipedia',
    title: 'T',
    summary: 'S',
    source: { sourceName: 'X', sourceUrl: 'https://example.com/' },
  },
};

/** A provider that answers `outcome` and counts its calls. */
function provider(
  name: DefinitionProvider['name'],
  outcome: Promise<ProviderOutcome> | ProviderOutcome,
) {
  const calls: string[] = [];
  const fake: DefinitionProvider & { calls: string[] } = {
    name,
    calls,
    lookup: (term) => {
      calls.push(term);
      return Promise.resolve(outcome);
    },
  };
  return fake;
}

const CONTEXT: ProviderContext = {
  fetch: () => Promise.reject(new Error('the fake providers make no requests')),
  timeoutMs: 1000,
};

/** The real providers, with upstream answers by URL. */
function withUpstreams(term: string, replies: { wikt: Reply; dict: Reply; wp: Reply }) {
  const title = term.replaceAll(' ', '_');
  const fake = fakeFetch({
    [WIKTIONARY + title]: replies.wikt,
    [DICTIONARY_API + encodeURIComponent(term)]: replies.dict,
    [WIKIPEDIA + title]: replies.wp,
  });
  return {
    fake,
    outcome: lookupDefinition(term, { fetch: fake.fetch, timeoutMs: 1000 }),
  };
}

describe('DEF-17: first found wins', () => {
  it.fails('Wiktionary finds it: nothing else is asked', async () => {
    const { fake, outcome } = withUpstreams('roof', {
      wikt: json(WIKT_ROOF),
      dict: json(DICT_GABLE),
      wp: json(WP_HIP_ROOF),
    });

    expect(await outcome).toMatchObject({
      status: 'found',
      definition: { source: { sourceName: 'Wiktionary' } },
    });
    expect(fake.urls()).toEqual([`${WIKTIONARY}roof`]);
  });

  it.fails('stops at the first provider that finds it', async () => {
    const first = provider('wiktionary', NOT_FOUND);
    const second = provider('dictionaryapi', FOUND);
    const third = provider('wikipedia', FOUND);

    expect(await lookupDefinition('roof', CONTEXT, [first, second, third])).toEqual(FOUND);
    expect([first.calls, second.calls, third.calls]).toEqual([['roof'], ['roof'], []]);
  });
});

describe('DEF-18: not-found and failed both fall through', () => {
  it.fails.each([
    ['not found', status(404)],
    ['fails', status(500)],
  ])('Wiktionary %s: dictionaryapi.dev is asked', async (_name, wikt) => {
    const { fake, outcome } = withUpstreams('gable', {
      wikt,
      dict: json(DICT_GABLE),
      wp: json(WP_HIP_ROOF),
    });

    expect(await outcome).toEqual({ status: 'found', definition: DICT_GABLE_DEFINITION });
    expect(fake.urls()).toEqual([`${WIKTIONARY}gable`, `${DICTIONARY_API}gable`]);
  });

  it.fails('no dictionary has it: Wikipedia is asked last', async () => {
    const { fake, outcome } = withUpstreams('hipped roof', {
      wikt: status(404),
      dict: status(503),
      wp: json(WP_HIP_ROOF),
    });

    expect(await outcome).toMatchObject({
      status: 'found',
      definition: { from: 'wikipedia', title: 'Hip roof' },
    });
    expect(fake.urls()).toEqual([
      `${WIKTIONARY}hipped_roof`,
      `${DICTIONARY_API}hipped%20roof`,
      `${WIKIPEDIA}hipped_roof`,
    ]);
  });

  it.fails('asks one provider at a time', async () => {
    let answerFirst: (outcome: ProviderOutcome) => void = () => {};
    const first = provider(
      'wiktionary',
      new Promise<ProviderOutcome>((resolve) => {
        answerFirst = resolve;
      }),
    );
    const second = provider('dictionaryapi', FOUND);

    const outcome = lookupDefinition('roof', CONTEXT, [first, second]);
    // Awaited below; this stops an early failure from also reporting an unhandled rejection.
    outcome.catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect([first.calls, second.calls]).toEqual([['roof'], []]);

    answerFirst(NOT_FOUND);
    expect(await outcome).toEqual(FOUND);
    expect(second.calls).toEqual(['roof']);
  });
});

describe('DEF-19: nothing found', () => {
  it.fails('every provider said not found: not found', async () => {
    const { outcome } = withUpstreams('xyzzy', {
      wikt: status(404),
      dict: status(404),
      wp: status(404),
    });

    expect(await outcome).toEqual({ status: 'not-found' });
  });

  it.fails.each([
    ['the first', FAILED, NOT_FOUND, NOT_FOUND],
    ['the last', NOT_FOUND, NOT_FOUND, FAILED],
    ['every', FAILED, FAILED, FAILED],
  ])('%s provider failed: failed', async (_name, wikt, dict, wp) => {
    const providers = [
      provider('wiktionary', wikt),
      provider('dictionaryapi', dict),
      provider('wikipedia', wp),
    ];

    expect(await lookupDefinition('xyzzy', CONTEXT, providers)).toMatchObject({
      status: 'failed',
    });
  });
});
