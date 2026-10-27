// Acceptance criteria CLIENT-1…7 from docs/features/lookup-client.md.
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { LookupResult } from '@litsnap/shared';
import { LOOKUP_ORIGIN } from '../../config/lookup';
import { createWorkerLookupClient, LOOKUP_TIMEOUT_MS, lookupBaseUrl } from './workerClient';

const BASE = 'https://worker.test';
const RESULT: LookupResult = { term: 'hipped roof', definition: { status: 'not-found' } };

/** A `fetch` that records each request and answers with `reply`. */
function fakeFetch(reply: (init: RequestInit | undefined) => Response | Promise<Response>) {
  const sent: { request: Request; init: RequestInit | undefined }[] = [];
  const fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    sent.push({ request: new Request(input, init), init });
    return Promise.resolve().then(() => reply(init));
  }) as typeof globalThis.fetch;
  return { fetch, sent };
}

/** Never answers; rejects with the signal's reason once it's aborted, like `fetch`. */
const hang = (init: RequestInit | undefined) =>
  new Promise<Response>((_resolve, reject) => {
    const signal = init?.signal;
    if (signal?.aborted) reject(signal.reason as Error);
    signal?.addEventListener('abort', () => {
      reject(signal.reason as Error);
    });
  });

const lookUp = (fetch: typeof globalThis.fetch, signal = new AbortController().signal) =>
  createWorkerLookupClient(BASE, { fetch, timeoutMs: 1000 }).lookup('hipped roof', 'both', signal);

describe('CLIENT-1: a lookup', () => {
  it('GETs /lookup with the term and kind, and resolves with the result', async () => {
    const fake = fakeFetch(() => Response.json(RESULT));

    expect(await lookUp(fake.fetch)).toEqual(RESULT);
    expect(fake.sent).toHaveLength(1);
    expect(fake.sent[0]?.request.method).toBe('GET');
    expect(fake.sent[0]?.request.url).toBe(`${BASE}/lookup?term=hipped%20roof&kind=both`);
  });
});

describe('CLIENT-1: characters that mean something in a query are encoded', () => {
  it.each([
    ['r&b', 'r%26b'],
    ['a+b', 'a%2Bb'],
    ['what?', 'what%3F'],
  ])('%j → %s', async (term, encoded) => {
    const fake = fakeFetch(() => Response.json(RESULT));

    await createWorkerLookupClient(BASE, { fetch: fake.fetch }).lookup(
      term,
      'definition',
      new AbortController().signal,
    );

    expect(fake.sent[0]?.request.url).toBe(`${BASE}/lookup?term=${encoded}&kind=definition`);
  });
});

describe('CLIENT-2: an error status rejects', () => {
  it.each([400, 429, 500, 502])('%i', async (status) => {
    const fake = fakeFetch(() => Response.json({ error: 'x' }, { status }));

    await expect(lookUp(fake.fetch)).rejects.toThrow();
  });
});

describe('CLIENT-3: a network error rejects', () => {
  it('rejects when fetch does', async () => {
    const fake = fakeFetch(() => Promise.reject(new TypeError('Failed to fetch')));

    await expect(lookUp(fake.fetch)).rejects.toThrow('Failed to fetch');
  });
});

describe('CLIENT-4: a slow Worker times out', () => {
  it('aborts the request and rejects', async () => {
    const fake = fakeFetch(hang);
    const client = createWorkerLookupClient(BASE, { fetch: fake.fetch, timeoutMs: 20 });

    await expect(
      client.lookup('roof', 'definition', new AbortController().signal),
    ).rejects.toThrow();
    expect(fake.sent[0]?.init?.signal?.aborted).toBe(true);
  });

  it('waits 15 seconds in production', () => {
    expect(LOOKUP_TIMEOUT_MS).toBe(15_000);
  });
});

describe('CLIENT-5: closing cancels', () => {
  it('rejects with an AbortError and aborts the request', async () => {
    const fake = fakeFetch(hang);
    const controller = new AbortController();

    const pending = lookUp(fake.fetch, controller.signal);
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(fake.sent[0]?.init?.signal?.aborted).toBe(true);
  });
});

describe('CLIENT-6: only the term leaves the browser', () => {
  it('sends term and kind only: no body, no custom headers, no credentials', async () => {
    const fake = fakeFetch(() => Response.json(RESULT));

    await lookUp(fake.fetch);

    const sent = fake.sent[0];
    expect([...new URL(sent?.request.url ?? '').searchParams.keys()]).toEqual(['term', 'kind']);
    expect(sent?.request.body).toBeNull();
    expect([...(sent?.request.headers.keys() ?? [])]).toEqual([]);
    expect(sent?.init?.credentials).toBe('omit');
  });
});

describe('CLIENT-7: which Worker', () => {
  it('a production build uses LOOKUP_ORIGIN, even if VITE_LOOKUP_URL is set', () => {
    expect(lookupBaseUrl({ DEV: false })).toBe(LOOKUP_ORIGIN);
    expect(lookupBaseUrl({ DEV: false, VITE_LOOKUP_URL: 'https://elsewhere.test' })).toBe(
      LOOKUP_ORIGIN,
    );
  });

  it('pnpm dev uses VITE_LOOKUP_URL, or wrangler dev on port 8787', () => {
    expect(lookupBaseUrl({ DEV: true, VITE_LOOKUP_URL: 'https://elsewhere.test' })).toBe(
      'https://elsewhere.test',
    );
    expect(lookupBaseUrl({ DEV: true })).toBe('http://localhost:8787');
    expect(lookupBaseUrl({ DEV: true, VITE_LOOKUP_URL: '' })).toBe('http://localhost:8787');
  });
});
