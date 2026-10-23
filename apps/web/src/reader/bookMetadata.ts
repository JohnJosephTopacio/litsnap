// Turns foliate's metadata shapes into plain strings for display and storage.
// The results are untrusted book text: render them as text, never as HTML (RD-24).
import type { BookMetadata, Contributor, LanguageMap } from 'foliate-js/view.js';

function fromLanguageMap(value: LanguageMap | undefined): string {
  if (typeof value === 'string') return value.trim();
  // Alternate scripts: take the first, as foliate's own reader does.
  return Object.values(value ?? {})[0]?.trim() ?? '';
}

function fromContributor(contributor: Contributor): string {
  return typeof contributor === 'string' ? contributor.trim() : fromLanguageMap(contributor.name);
}

export function bookTitle(metadata: BookMetadata | undefined): string {
  return fromLanguageMap(metadata?.title);
}

/** All authors, joined as "A, B, and C" (`Intl.ListFormat`). Empty if the book names none. */
export function bookAuthor(metadata: BookMetadata | undefined): string {
  const author = metadata?.author;
  const names = (Array.isArray(author) ? author : author ? [author] : [])
    .map(fromContributor)
    .filter(Boolean);
  return new Intl.ListFormat('en', { type: 'conjunction' }).format(names);
}
