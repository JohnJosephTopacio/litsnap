// The contract every definition source implements. Spec: docs/features/definition-providers.md.
import type { FoundDefinition } from '@litsnap/shared';

/** How long one upstream request may take before it's aborted (DEF-3). */
export const DEFAULT_TIMEOUT_MS = 3000;

export interface ProviderContext {
  /** The Worker's `fetch` in production, a fake in tests. */
  fetch: typeof fetch;
  /** Per upstream request (DEF-3). */
  timeoutMs: number;
  /** For image file details, which Wikimedia is slow to make the first time (IMG-3). Defaults to `timeoutMs`. */
  detailsTimeoutMs?: number;
}

/** `reason` is for logs, never shown to readers. */
export type ProviderOutcome =
  | { status: 'found'; definition: FoundDefinition }
  | { status: 'not-found' }
  | { status: 'failed'; reason: string };

export interface DefinitionProvider {
  name: 'wiktionary' | 'dictionaryapi' | 'wikipedia';
  /** Never throws: errors are `failed` (DEF-1). */
  lookup(term: string, context: ProviderContext): Promise<ProviderOutcome>;
}
