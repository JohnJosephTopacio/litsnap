// CLIENT-12 (docs/features/lookup-client.md): the real sources still answer the way our parsers
// expect. Uses the network, so it's not part of `pnpm test`: run `pnpm --filter @litsnap/worker
// test:live`, or the live-check workflow. Terms are well established, so they shouldn't vanish.
import { describe, expect, it } from 'vitest';
import { lookupDefinition } from '../src/definitions/chain';
import { dictionaryApi } from '../src/definitions/dictionaryApi';
import type { ProviderContext } from '../src/definitions/types';
import { wikipedia } from '../src/definitions/wikipedia';
import { wiktionary } from '../src/definitions/wiktionary';

// Longer than production's 3 s: a slow day upstream shouldn't fail the check.
const context: ProviderContext = {
  fetch: (input, init) => fetch(input, init),
  timeoutMs: 10_000,
};

describe('live sources', () => {
  it('Wiktionary has hip roof as an English noun', async () => {
    expect(await wiktionary.lookup('hip roof', context)).toMatchObject({
      status: 'found',
      definition: {
        from: 'dictionary',
        entries: expect.arrayContaining([expect.objectContaining({ partOfSpeech: 'noun' })]) as [],
        source: { sourceUrl: 'https://en.wiktionary.org/wiki/hip_roof' },
      },
    });
  });

  it('Wiktionary still marks hipped roof as a cross-reference to hip roof', async () => {
    expect(await wiktionary.lookup('hipped roof', context)).toMatchObject({
      status: 'found',
      definition: {
        note: expect.stringMatching(/hip roof/i) as string,
        source: { sourceUrl: 'https://en.wiktionary.org/wiki/hip_roof' },
      },
    });
  });

  it('dictionaryapi.dev has house, with a licence and source', async () => {
    expect(await dictionaryApi.lookup('house', context)).toMatchObject({
      status: 'found',
      definition: {
        from: 'dictionary',
        source: { licence: expect.any(String) as string, sourceUrl: expect.any(String) as string },
      },
    });
  });

  it('Wikipedia has a summary for nikola tesla', async () => {
    expect(await wikipedia.lookup('nikola tesla', context)).toMatchObject({
      status: 'found',
      definition: { from: 'wikipedia', title: 'Nikola Tesla' },
    });
  });

  it('the chain falls through to Wikipedia for nikola tesla', async () => {
    expect(await lookupDefinition('nikola tesla', context)).toMatchObject({
      status: 'found',
      definition: { from: 'wikipedia' },
    });
  });
});
