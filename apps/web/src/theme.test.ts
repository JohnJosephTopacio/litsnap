// @vitest-environment node
// VIS-1 and VIS-2 from docs/features/visual-design.md.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { THEME_COLORS } from './reader/appearance';
import { TOKENS, type Tokens } from './theme';

const THEMES = ['light', 'dark'] as const;

const CSS_NAMES: Record<keyof Tokens, string> = {
  paper: '--paper',
  ink: '--ink',
  ink2: '--ink-2',
  mark: '--mark',
  rule: '--rule',
  track: '--track',
  dim: '--dim',
};

/** The custom properties declared in `:root[data-theme='<theme>'] { … }` in styles.css. */
function cssTokens(theme: string): Record<string, string> {
  const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
  const block = new RegExp(`:root\\[data-theme='${theme}'\\]\\s*\\{([^}]*)\\}`).exec(css)?.[1];
  const declarations = [...(block ?? '').matchAll(/(--[\w-]+):\s*([^;]+);/g)];
  return Object.fromEntries(
    declarations.map((match): [string, string] => [
      match[1] ?? '',
      (match[2] ?? '').trim().toLowerCase(),
    ]),
  );
}

/** WCAG relative luminance of a `#rrggbb` colour. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r = 0, g = 0, b = 0] = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

describe.each(THEMES)('%s theme', (theme) => {
  const t = TOKENS[theme];

  it('VIS-1: styles.css declares exactly the tokens in theme.ts', () => {
    const expected = Object.fromEntries(
      Object.entries(t).map(([key, value]) => [CSS_NAMES[key as keyof Tokens], value]),
    );

    expect(cssTokens(theme)).toEqual(expected);
  });

  it("VIS-1: the book's colours are the tokens", () => {
    expect(THEME_COLORS[theme]).toEqual({ background: t.paper, text: t.ink, link: t.ink });
  });

  it.each([
    ['ink on paper', t.ink, t.paper],
    ['ink-2 on paper', t.ink2, t.paper],
    ['ink on track', t.ink, t.track],
    ['paper on ink (a pressed pill)', t.paper, t.ink],
  ])('VIS-2: text %s is at least 4.5:1', (_, text, background) => {
    expect(contrast(text, background)).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ['mark on paper (control outlines)', t.mark, t.paper],
    ['ink on track (progress fill)', t.ink, t.track],
  ])('VIS-2: %s is at least 3:1', (_, mark, background) => {
    expect(contrast(mark, background)).toBeGreaterThanOrEqual(3);
  });

  it('VIS-2: mark would fail as small text, which is why it never carries any', () => {
    expect(contrast(t.mark, t.paper)).toBeLessThan(4.5);
  });
});
