// How reader settings turn into CSS inside the book. Spec: docs/features/epub-reader.md (RD-15…17).
import type { Theme } from '../storage/bookStore';

export const THEME_COLORS = {
  light: { background: '#fdfcf9', text: '#1f1d1a', link: '#1d4ed8' },
  dark: { background: '#17161a', text: '#e8e6e3', link: '#93b4ff' },
} as const satisfies Record<Theme, Record<string, string>>;

/** The saved choice wins; with none saved, follow the OS (RD-16). */
export function effectiveTheme(saved: Theme | undefined, prefersDark: boolean): Theme {
  return saved ?? (prefersDark ? 'dark' : 'light');
}

/**
 * CSS injected into every section of the book.
 *
 * - Font size scales the root, so the publisher's relative sizes (em, rem, %) all follow (RD-15).
 * - Colours are forced with `!important` on every element, because publisher CSS often hard-codes
 *   them and would otherwise leave dark text on a dark page (RD-17). Only colours are touched:
 *   fonts, sizes and layout stay the publisher's, and images are never filtered or inverted.
 * - One layout exception: `<body>` is never positioned (RD-29). foliate widens its frame to fit
 *   the content, so an absolutely positioned, full-width body grows with it in a loop. foliate
 *   already resets `position` on `<html>` for the same reason, but not on `<body>`.
 */
export function bookCss({ fontSize, theme }: { fontSize: number; theme: Theme }): string {
  const colors = THEME_COLORS[theme];
  return `
html {
  color-scheme: ${theme};
  font-size: ${String(fontSize)}% !important;
}
html, body {
  background-color: ${colors.background} !important;
  color: ${colors.text} !important;
}
body {
  position: static !important;
}
body * {
  color: ${colors.text} !important;
  /* Only descendants: body itself keeps the theme background above. */
  background-color: transparent !important;
  border-color: color-mix(in srgb, ${colors.text} 30%, transparent) !important;
}
body a:link, body a:visited, body a:link *, body a:visited * {
  color: ${colors.link} !important;
}`;
}
