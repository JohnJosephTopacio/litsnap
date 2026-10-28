// Asks the Worker's `GET /lookup` (docs/features/lookup-api.md). Spec: docs/features/lookup-client.md.
import type { LookupResult } from '@litsnap/shared';
import { LOOKUP_ORIGIN } from '../../config/lookup';
import type { LookupClient } from './client';

/** The Worker's worst case is about 12 s, so this only catches a hung connection (CLIENT-4). */
export const LOOKUP_TIMEOUT_MS = 20_000;

/** Where `wrangler dev` listens. */
const DEV_LOOKUP_URL = 'http://localhost:8787';

/** Production always uses `LOOKUP_ORIGIN`, the only one the CSP allows (CLIENT-7). */
export function lookupBaseUrl(env: { DEV: boolean; VITE_LOOKUP_URL?: string }): string {
  if (!env.DEV) return LOOKUP_ORIGIN;
  return env.VITE_LOOKUP_URL || DEV_LOOKUP_URL;
}

interface Options {
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

export function createWorkerLookupClient(
  baseUrl: string,
  // A wrapper, because calling `window.fetch` detached from `window` throws "Illegal invocation".
  {
    fetch = (input, init) => globalThis.fetch(input, init),
    timeoutMs = LOOKUP_TIMEOUT_MS,
  }: Options = {},
): LookupClient {
  return {
    async lookup(term, kind, signal) {
      // Only the term and kind leave the browser, with no headers or cookies (CLIENT-6).
      const url = `${baseUrl}/lookup?term=${encodeURIComponent(term)}&kind=${kind}`;
      const response = await fetch(url, {
        credentials: 'omit',
        signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
      });
      if (!response.ok) throw new Error(`Lookup failed: HTTP ${String(response.status)}`);
      return (await response.json()) as LookupResult;
    },
  };
}
