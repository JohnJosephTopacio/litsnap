// Runs the app with fake providers and a log recorder, for the lookup-api tests.
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import type { FoundDefinition } from '@litsnap/shared';
import { createApp, type AppDeps, type LookupLog } from '../../src/app';
import type { DefinitionProvider, ProviderOutcome } from '../../src/definitions/types';

export const FOUND_DICTIONARY: FoundDefinition = {
  from: 'dictionary',
  entries: [{ partOfSpeech: 'noun', senses: ['A sense.'] }],
  source: { sourceName: 'Wiktionary', sourceUrl: 'https://en.wiktionary.org/wiki/roof' },
};

export const FOUND: ProviderOutcome = { status: 'found', definition: FOUND_DICTIONARY };
export const NOT_FOUND: ProviderOutcome = { status: 'not-found' };
export const FAILED: ProviderOutcome = { status: 'failed', reason: 'HTTP 500' };

/** A provider that answers `outcome` every time and records the terms it was asked for. */
export function fakeProvider(name: DefinitionProvider['name'], outcome: ProviderOutcome) {
  const calls: string[] = [];
  const provider: DefinitionProvider & { calls: string[] } = {
    name,
    calls,
    lookup: (term) => {
      calls.push(term);
      return Promise.resolve(outcome);
    },
  };
  return provider;
}

/** Lets every request through, for tests that aren't about the rate limit. */
export const allowAll: AppDeps['rateLimit'] = () => Promise.resolve({ allowed: true });

/** The app with `deps`, recording its logs. Requests wait for `waitUntil` work such as cache writes. */
export function setUp(deps: Partial<AppDeps> = {}) {
  const logs: LookupLog[] = [];
  const app = createApp({
    rateLimit: allowAll,
    log: (entry) => {
      logs.push(entry);
    },
    ...deps,
  });
  async function send(request: Request) {
    const ctx = createExecutionContext();
    const response = await app.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);
    return response;
  }
  const get = (path: string, headers: Record<string, string> = {}) =>
    send(new Request(`https://worker.test${path}`, { headers }));
  return { logs, send, get };
}

/** `/lookup` with `term` URL-encoded. */
export const lookupPath = (term: string, kind = 'definition') =>
  `/lookup?term=${encodeURIComponent(term)}&kind=${kind}`;
