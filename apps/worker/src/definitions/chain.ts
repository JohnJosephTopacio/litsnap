// Asks each definition source in turn; the first that finds the term wins (DEF-17…19).
// Spec: docs/features/definition-providers.md.
import { dictionaryApi } from './dictionaryApi';
import type { DefinitionProvider, ProviderContext, ProviderOutcome } from './types';
import { wikipedia } from './wikipedia';
import { wiktionary } from './wiktionary';

/** In the order they're asked (spec §5). */
export const DEFINITION_PROVIDERS: readonly DefinitionProvider[] = [
  wiktionary,
  dictionaryApi,
  wikipedia,
];

// RED PHASE: stub until the implementation PR.
export const lookupDefinition: (
  term: string,
  context: ProviderContext,
  providers?: readonly DefinitionProvider[],
) => Promise<ProviderOutcome> = () =>
  Promise.reject(new Error('lookupDefinition is not implemented yet'));
