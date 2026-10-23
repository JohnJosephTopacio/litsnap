import { afterEach, describe, expect, it, vi } from 'vitest';
import { bookAuthor, bookTitle } from './bookMetadata';
import { externalLinkUrl, openExternalLink } from './externalLinks';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('bookTitle', () => {
  it.each([
    [{ title: 'Dr. Jekyll ' }, 'Dr. Jekyll'],
    [{ title: { en: 'Hyde', fr: 'Hyde (fr)' } }, 'Hyde'],
    [{}, ''],
    [undefined, ''],
  ])('reads %j as %j', (metadata, title) => {
    expect(bookTitle(metadata)).toBe(title);
  });
});

describe('bookAuthor', () => {
  it.each([
    [{ author: 'Robert Louis Stevenson' }, 'Robert Louis Stevenson'],
    [{ author: { name: { en: 'R. L. Stevenson' } } }, 'R. L. Stevenson'],
    [{ author: ['A', { name: 'B' }, 'C'] }, 'A, B, and C'],
    [{ author: [] }, ''],
    [undefined, ''],
  ])('reads %j as %j', (metadata, author) => {
    expect(bookAuthor(metadata)).toBe(author);
  });
});

describe('RD-20: external links', () => {
  it.each(['https://standardebooks.org/', 'http://example.com/a?b#c'])('allows %s', (href) => {
    expect(externalLinkUrl(href)).toBe(href);
  });

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'mailto:someone@example.com',
    'file:///etc/passwd',
    'blob:https://litsnap.pages.dev/x',
    'chapter2.xhtml',
    '',
  ])('ignores %s', (href) => {
    expect(externalLinkUrl(href)).toBeUndefined();
  });

  it('opens allowed links in a new tab with noopener and noreferrer', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);

    openExternalLink('https://standardebooks.org/');
    openExternalLink('javascript:alert(1)');

    expect(open.mock.calls).toEqual([
      ['https://standardebooks.org/', '_blank', 'noopener,noreferrer'],
    ]);
  });
});
