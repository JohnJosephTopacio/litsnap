// dictionaryapi.dev, a fallback when Wiktionary is down or misses a word (DEF-13, DEF-14).
// Spec: docs/features/definition-providers.md.
import type { Attribution } from '@litsnap/shared';
import { getJson } from './http';
import { collapse, isRecord, limitEntries } from './text';
import type { DefinitionProvider, ProviderOutcome } from './types';

const API = 'https://api.dictionaryapi.dev/api/v2/entries/en/';

const UNEXPECTED: ProviderOutcome = { status: 'failed', reason: 'unexpected response' };

function credit(entry: Record<string, unknown>): Attribution | undefined {
  const { license, sourceUrls } = entry;
  if (!isRecord(license) || typeof license.name !== 'string' || typeof license.url !== 'string')
    return undefined;
  const sourceUrl: unknown = Array.isArray(sourceUrls) ? sourceUrls[0] : undefined;
  if (typeof sourceUrl !== 'string') return undefined;
  return {
    sourceName: 'Wiktionary (via Free Dictionary API)',
    sourceUrl,
    licence: license.name,
    licenceUrl: license.url,
  };
}

export const dictionaryApi: DefinitionProvider = {
  name: 'dictionaryapi',
  async lookup(term, context) {
    const reply = await getJson(API + encodeURIComponent(term), context);
    if (reply.status === 'missing') return { status: 'not-found' };
    if (reply.status === 'failed') return reply;
    if (!Array.isArray(reply.body)) return UNEXPECTED;

    let source: Attribution | undefined;
    const senses = new Map<string, string[]>();
    for (const entry of reply.body) {
      if (!isRecord(entry) || !Array.isArray(entry.meanings)) return UNEXPECTED;
      const entryCredit = credit(entry);
      if (!entryCredit) continue;
      source ??= entryCredit;
      for (const meaning of entry.meanings) {
        if (
          !isRecord(meaning) ||
          typeof meaning.partOfSpeech !== 'string' ||
          !Array.isArray(meaning.definitions)
        )
          return UNEXPECTED;
        const partOfSpeech = meaning.partOfSpeech.toLowerCase();
        const list = senses.get(partOfSpeech) ?? [];
        senses.set(partOfSpeech, list);
        for (const definition of meaning.definitions) {
          if (isRecord(definition) && typeof definition.definition === 'string')
            list.push(collapse(definition.definition));
        }
      }
    }

    const entries = limitEntries(
      [...senses].map(([partOfSpeech, list]) => ({ partOfSpeech, senses: list })),
    );
    if (!source || entries.length === 0) return { status: 'not-found' };
    return { status: 'found', definition: { from: 'dictionary', entries, source } };
  },
};
