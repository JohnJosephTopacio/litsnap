// The Wikipedia article summary for the exact title, when no dictionary has the term (DEF-15, DEF-16).
// Spec: docs/features/definition-providers.md.
import type { DefinitionProvider } from './types';

// RED PHASE: stub until the implementation PR.
export const wikipedia: DefinitionProvider = {
  name: 'wikipedia',
  lookup: () => Promise.reject(new Error('wikipedia is not implemented yet')),
};
