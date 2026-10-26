// Wiktionary's REST definitions, English only, following a cross-reference once (DEF-6…12).
// Spec: docs/features/definition-providers.md.
import type { Attribution, DictionaryDefinition } from '@litsnap/shared';
import { getJson, pageTitle } from './http';
import { decodeEntities, htmlToText, isRecord, limitEntries } from './text';
import type { DefinitionProvider, ProviderContext, ProviderOutcome } from './types';

const API = 'https://en.wiktionary.org/api/rest_v1/page/definition/';

/** An English entry with its senses still as HTML, empty ones dropped. */
interface RawEntry {
  partOfSpeech: string;
  senses: string[];
}

type Page =
  { status: 'found'; entries: RawEntry[] } | Exclude<ProviderOutcome, { status: 'found' }>;

/** A sense marked up by one of Wiktionary's "form of" templates (DEF-10). */
const CROSS_REFERENCE = /class="(?:[^"]*\s)?form-of-definition(?:\s[^"]*)?"/;
const TARGET =
  /class="(?:[^"]*\s)?form-of-definition-link(?:\s[^"]*)?"[^>]*>[\s\S]*?<a\b[^>]*\btitle="([^"]*)"/;

function parse(body: unknown): RawEntry[] | undefined {
  if (!isRecord(body)) return undefined;
  const english = body.en ?? [];
  if (!Array.isArray(english)) return undefined;
  const entries: RawEntry[] = [];
  for (const entry of english) {
    if (
      !isRecord(entry) ||
      typeof entry.partOfSpeech !== 'string' ||
      !Array.isArray(entry.definitions)
    )
      return undefined;
    if (entry.language !== 'English') continue;
    const senses: string[] = [];
    for (const definition of entry.definitions) {
      if (!isRecord(definition) || typeof definition.definition !== 'string') return undefined;
      if (htmlToText(definition.definition) !== '') senses.push(definition.definition);
    }
    if (senses.length > 0) entries.push({ partOfSpeech: entry.partOfSpeech, senses });
  }
  return entries;
}

async function fetchPage(term: string, context: ProviderContext): Promise<Page> {
  const title = pageTitle(term);
  if (title === undefined) return { status: 'not-found' };
  const reply = await getJson(API + title, context, [400, 404]);
  if (reply.status === 'missing') return { status: 'not-found' };
  if (reply.status === 'failed') return reply;
  const entries = parse(reply.body);
  if (entries === undefined) return { status: 'failed', reason: 'unexpected response' };
  return entries.length > 0 ? { status: 'found', entries } : { status: 'not-found' };
}

const source = (term: string): Attribution => ({
  sourceName: 'Wiktionary',
  sourceUrl: `https://en.wiktionary.org/wiki/${encodeURIComponent(term.replaceAll(' ', '_'))}`,
  licence: 'CC BY-SA 4.0',
  licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
});

const toEntries = (entries: RawEntry[]) =>
  limitEntries(
    entries.map(({ partOfSpeech, senses }) => ({ partOfSpeech, senses: senses.map(htmlToText) })),
  );

const found = (definition: DictionaryDefinition): ProviderOutcome => ({
  status: 'found',
  definition,
});

export const wiktionary: DefinitionProvider = {
  name: 'wiktionary',
  async lookup(term, context) {
    const page = await fetchPage(term, context);
    if (page.status !== 'found') return page;
    const own = found({
      from: 'dictionary',
      entries: toEntries(page.entries),
      source: source(term),
    });

    const senses = page.entries.flatMap((entry) => entry.senses);
    if (!senses.every((sense) => CROSS_REFERENCE.test(sense))) return own;
    const first = senses[0] ?? '';
    const target = TARGET.exec(first)?.[1];
    if (target === undefined) return own;

    const targetTerm = decodeEntities(target);
    const targetPage = await fetchPage(targetTerm, context);
    if (targetPage.status !== 'found') return own;
    const note = htmlToText(first);
    return found({
      from: 'dictionary',
      entries: toEntries(targetPage.entries),
      note: note.charAt(0).toUpperCase() + note.slice(1),
      source: source(targetTerm),
    });
  },
};
