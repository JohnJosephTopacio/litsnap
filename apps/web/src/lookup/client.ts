// Where the lookup modal's content comes from. Spec: docs/features/lookup-modal.md.
import type { LookupKind, LookupResult } from '@litsnap/shared';
import { createMockLookupClient } from './mockClient';

/** Fetches a lookup. Rejects on network errors and rate limits; with an AbortError if aborted. */
export interface LookupClient {
  lookup(term: string, kind: LookupKind, signal: AbortSignal): Promise<LookupResult>;
}

/**
 * Production has no lookups until M3, so the modal says they're coming soon (MODAL-5); `pnpm dev`
 * uses sample data. Vite replaces `import.meta.env.DEV` with `false` in builds, so the mock is
 * dropped from the production bundle.
 */
export const defaultLookupClient: LookupClient | undefined = import.meta.env.DEV
  ? createMockLookupClient()
  : undefined;
