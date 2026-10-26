// Wiktionary's REST definitions, English only, following a cross-reference once (DEF-6…12).
// Spec: docs/features/definition-providers.md.
import type { DefinitionProvider } from './types';

// RED PHASE: stub until the implementation PR.
export const wiktionary: DefinitionProvider = {
  name: 'wiktionary',
  lookup: () => Promise.reject(new Error('wiktionary is not implemented yet')),
};
