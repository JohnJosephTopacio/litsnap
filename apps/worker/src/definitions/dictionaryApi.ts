// dictionaryapi.dev, a fallback when Wiktionary is down or misses a word (DEF-13, DEF-14).
// Spec: docs/features/definition-providers.md.
import type { DefinitionProvider } from './types';

// RED PHASE: stub until the implementation PR.
export const dictionaryApi: DefinitionProvider = {
  name: 'dictionaryapi',
  lookup: () => Promise.reject(new Error('dictionaryApi is not implemented yet')),
};
