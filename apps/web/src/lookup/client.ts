// Where the lookup modal's content comes from. Spec: docs/features/lookup-modal.md.
import type { LookupKind, LookupResult } from '@litsnap/shared';
import { createWorkerLookupClient, lookupBaseUrl } from './workerClient';

/** Fetches a lookup. Rejects on network errors and rate limits; with an AbortError if aborted. */
export interface LookupClient {
  lookup(term: string, kind: LookupKind, signal: AbortSignal): Promise<LookupResult>;
}

/** The Worker: deployed in production, `wrangler dev` in `pnpm dev` (lookup-client.md, CLIENT-7). */
export const defaultLookupClient: LookupClient = createWorkerLookupClient(
  lookupBaseUrl(import.meta.env),
);
