// Turns a reader's selection into the term we look up and the term we display.
// Shared so the Worker (M3) normalises exactly like the web app. Spec: docs/features/lookup-term.md.

/** The menu offers lookups for selections of 1 to this many words (spec §4.1). */
export const MAX_LOOKUP_WORDS = 6;

/** Soft hyphen, zero-width space/non-joiner/joiner, word joiner, byte-order mark (TERM-3). */
const INVISIBLE = /[\u00AD\u200B-\u200D\u2060\uFEFF]/g;
/** Hyphen-minus, U+2010–U+2015 (hyphens and dashes) and slash separate words (TERM-6). */
const SEPARATORS = /[-\u2010-\u2015/]/g;
/** Anything at either end that isn't a letter, digit or combining mark (TERM-2). */
const SURROUNDING = /^[^\p{L}\p{N}\p{M}]+|[^\p{L}\p{N}\p{M}]+$/gu;

/** Steps shared by both terms: invisible characters, NFC, whitespace, surrounding punctuation. */
function tidy(text: string): string {
  return text.replace(INVISIBLE, '').normalize('NFC').replace(/\s+/g, ' ').replace(SURROUNDING, '');
}

/** The lookup term: what the Worker receives and the Google link searches for (TERM-1…7). */
export function normalise(selection: string): string {
  const straight = selection.replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"');
  return tidy(straight.replace(SEPARATORS, ' ')).toLowerCase();
}

/** Words in a normalised term: space-separated pieces with a letter or digit (TERM-8). */
export function countWords(term: string): number {
  return term.split(' ').filter((piece) => /[\p{L}\p{N}]/u.test(piece)).length;
}

/** The term as the modal header shows it, keeping the book's casing (TERM-9). */
export function displayTerm(selection: string): string {
  return tidy(selection);
}
