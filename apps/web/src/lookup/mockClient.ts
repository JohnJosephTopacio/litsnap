// Sample lookups for `pnpm dev` and the component tests, until the Worker answers in M3. The
// wording is our own and the source says "sample data", so nobody mistakes it for a real entry.
import type { DefinitionSection, LookupKind, LookupResult } from '@litsnap/shared';
import type { LookupClient } from './client';

/** Terms the mock knows: anything else is "not found". */
export const MOCK_TERMS = {
  found: 'hipped roof',
  wikipedia: 'flying buttress',
  error: 'fail',
} as const;

const SAMPLE_SOURCE = {
  sourceName: 'LitSnap sample data',
  sourceUrl: 'https://litsnap.pages.dev/',
  licence: 'Sample text, not a real dictionary entry',
};

const DEFINITIONS: Record<string, DefinitionSection> = {
  [MOCK_TERMS.found]: {
    status: 'found',
    from: 'dictionary',
    entries: [
      {
        partOfSpeech: 'noun',
        senses: [
          'A roof whose sides all slope down to the walls, with no vertical ends.',
          'A building with such a roof.',
        ],
      },
    ],
    source: SAMPLE_SOURCE,
  },
  [MOCK_TERMS.wikipedia]: {
    status: 'found',
    from: 'wikipedia',
    title: 'Flying buttress',
    summary:
      'A sloping support that carries the outward push of a high wall or vault across an open space to a pier.',
    source: SAMPLE_SOURCE,
  },
};

/** Resolves after `ms`, or rejects with the signal's AbortError if it fires first. */
function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason as Error);
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason as Error);
    });
  });
}

const wants = (kind: LookupKind, section: 'definition' | 'image') =>
  kind === 'both' || kind === section;

/** `delayMs` makes the loading state visible in `pnpm dev`. */
export function createMockLookupClient({ delayMs = 600 } = {}): LookupClient {
  return {
    async lookup(term, kind, signal) {
      await wait(delayMs, signal);
      if (term === MOCK_TERMS.error) throw new Error('Sample lookup failure');
      const result: LookupResult = { term };
      if (wants(kind, 'definition'))
        result.definition = DEFINITIONS[term] ?? { status: 'not-found' };
      if (wants(kind, 'image')) result.images = { status: 'not-found' };
      return result;
    },
  };
}
