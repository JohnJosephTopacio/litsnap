// Runs the app with fake providers, a fake image chain and a log recorder, for the lookup-api tests.
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import type { FoundDefinition, LookupImage } from '@litsnap/shared';
import { createApp, type AppDeps, type LookupLog } from '../../src/app';
import type {
  DefinitionProvider,
  ProviderContext,
  ProviderOutcome,
} from '../../src/definitions/types';
import type { ImageOutcome } from '../../src/images/types';

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

export const IMAGE: LookupImage = {
  thumbUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Barn.jpg/330px-Barn.jpg',
  fullUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Barn.jpg',
  alt: 'A barn with a hipped roof',
  title: 'Barn',
  mime: 'image/jpeg',
  width: 1000,
  height: 800,
  attribution: {
    author: 'Sample Author',
    licence: 'CC BY-SA 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
    sourceName: 'Wikimedia Commons',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Barn.jpg',
  },
};

export const IMAGES_FOUND: ImageOutcome = { status: 'found', images: [IMAGE] };
export const IMAGES_NOT_FOUND: ImageOutcome = { status: 'not-found' };
export const IMAGES_FAILED: ImageOutcome = { status: 'failed', reason: 'commons: HTTP 503' };

/** An image chain that answers `outcome` and records what it was asked. */
export function fakeImages(outcome: ImageOutcome | (() => Promise<ImageOutcome>)) {
  const calls: string[] = [];
  const contexts: ProviderContext[] = [];
  const images: AppDeps['images'] = (term, context) => {
    calls.push(term);
    contexts.push(context);
    return typeof outcome === 'function' ? outcome() : Promise.resolve(outcome);
  };
  return { images, calls, contexts };
}

/** Lets every request through, for tests that aren't about the rate limit. */
export const allowAll: AppDeps['rateLimit'] = () => Promise.resolve({ allowed: true });

/** Never runs out, for tests that aren't about the image budget (API-24). */
export const unlimitedBudget: AppDeps['imageBudget'] = () => Promise.resolve({ allowed: true });

/** The app with `deps`, recording its logs. Requests wait for `waitUntil` work such as cache writes. */
export function setUp(deps: Partial<AppDeps> = {}) {
  const logs: LookupLog[] = [];
  const app = createApp({
    rateLimit: allowAll,
    imageBudget: unlimitedBudget,
    // Never the real chain: tests don't use the network.
    images: fakeImages(IMAGES_NOT_FOUND).images,
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
