// How reader settings turn into CSS inside the book. Spec: docs/features/epub-reader.md (RD-15…17),
// colours from docs/features/visual-design.md (VIS-1, VIS-5).
import type { Theme } from '../storage/bookStore';
import { TOKENS } from '../theme';

/** Monochrome: links are the text colour, told apart by their underline (VIS-5). */
export const THEME_COLORS = {
  light: { background: TOKENS.light.paper, text: TOKENS.light.ink, link: TOKENS.light.ink },
  dark: { background: TOKENS.dark.paper, text: TOKENS.dark.ink, link: TOKENS.dark.ink },
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
 * - Links are always underlined, even if the publisher turned that off: with monochrome colours,
 *   the underline is what tells them apart from text (VIS-5).
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
}
body a:link, body a:visited {
  text-decoration: underline !important;
  text-decoration-thickness: 1px !important;
  text-underline-offset: 0.15em !important;
}`;
}
