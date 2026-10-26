// MODAL-4 from docs/features/lookup-modal.md: the Search Google ↗ link.
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { googleSearchUrl } from './google';

describe('googleSearchUrl', () => {
  describe('MODAL-4: Search Google ↗', () => {
    it.each(['definition', 'both'] as const)('searches the term for %s', (kind) => {
      expect(googleSearchUrl('hipped roof', kind)).toBe(
        'https://www.google.com/search?q=hipped+roof',
      );
    });

    it('searches Google Images for image', () => {
      expect(googleSearchUrl('hipped roof', 'image')).toBe(
        'https://www.google.com/search?q=hipped+roof&udm=2',
      );
    });

    it('encodes the term, so it cannot add parameters of its own', () => {
      const url = new URL(googleSearchUrl('u.s & co #1 &udm=9 ?x=é', 'definition'));
      expect(url.origin + url.pathname).toBe('https://www.google.com/search');
      expect([...url.searchParams.keys()]).toEqual(['q']);
      expect(url.searchParams.get('q')).toBe('u.s & co #1 &udm=9 ?x=é');
      expect(url.hash).toBe('');
    });
  });
});
