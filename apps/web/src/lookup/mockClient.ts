// Sample lookups for `pnpm dev` and the component tests, until the Worker answers in M3.
import type { LookupClient } from './client';

/** Terms the mock knows: anything else is "not found". */
export const MOCK_TERMS = {
  found: 'hipped roof',
  wikipedia: 'flying buttress',
  error: 'fail',
} as const;

// RED: stub until the implementation commit.
export const createMockLookupClient: (options?: { delayMs?: number }) => LookupClient = () => {
  throw new Error('createMockLookupClient is not implemented yet');
};
