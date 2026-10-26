// The Search Google ↗ fallback link (spec §4.5). Spec: docs/features/lookup-modal.md (MODAL-4).
import type { LookupKind } from '@litsnap/shared';

/** A Google search for `term` (Google Images for an image lookup). Only the term goes in. */
export function googleSearchUrl(term: string, kind: LookupKind): string {
  const url = new URL('https://www.google.com/search');
  url.searchParams.set('q', term);
  if (kind === 'image') url.searchParams.set('udm', '2');
  return url.href;
}
