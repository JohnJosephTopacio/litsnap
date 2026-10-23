// RD-20: which links from book content may leave the reader. Spec: docs/features/epub-reader.md.

/** The URL to open in a new tab, or `undefined` to ignore the link. Only absolute http(s) URLs. */
export function externalLinkUrl(href: string): string | undefined {
  try {
    const url = new URL(href);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Opens an http(s) link from a book in a new tab, without giving the new page a handle on
 * LitSnap (`noopener`) or telling it where the click came from (`noreferrer`).
 */
export function openExternalLink(href: string): void {
  const url = externalLinkUrl(href);
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
}
