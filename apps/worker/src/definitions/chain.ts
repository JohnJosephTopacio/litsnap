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

/** Asks each provider in turn (DEF-17, DEF-18). A failure may have hidden an entry (DEF-19). */
export async function lookupDefinition(
  term: string,
  context: ProviderContext,
  providers: readonly DefinitionProvider[] = DEFINITION_PROVIDERS,
): Promise<ProviderOutcome> {
  let failure: ProviderOutcome | undefined;
  for (const provider of providers) {
    const outcome = await provider.lookup(term, context);
    if (outcome.status === 'found') return outcome;
    if (outcome.status === 'failed')
      failure ??= { status: 'failed', reason: `${provider.name}: ${outcome.reason}` };
  }
  return failure ?? { status: 'not-found' };
}
