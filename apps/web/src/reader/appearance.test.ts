// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { bookCss, effectiveTheme, THEME_COLORS } from './appearance';

describe('RD-16: effectiveTheme', () => {
  it.each([
    [undefined, true, 'dark'],
    [undefined, false, 'light'],
    ['light', true, 'light'],
    ['dark', false, 'dark'],
  ] as const)('saved %s, OS prefers dark %s → %s', (saved, prefersDark, theme) => {
    expect(effectiveTheme(saved, prefersDark)).toBe(theme);
  });
});

describe('bookCss', () => {
  it('RD-15: scales the root font size', () => {
    expect(bookCss({ fontSize: 120, theme: 'light' })).toContain('font-size: 120% !important');
  });

  it.each(['light', 'dark'] as const)('RD-17: forces %s theme colours', (theme) => {
    const css = bookCss({ fontSize: 100, theme });

    expect(css).toContain(`background-color: ${THEME_COLORS[theme].background} !important`);
    expect(css).toContain(`color: ${THEME_COLORS[theme].text} !important`);
    expect(css).toContain(`color-scheme: ${theme}`);
  });

  it('RD-17: makes only descendants of body transparent, never body itself', () => {
    const css = bookCss({ fontSize: 100, theme: 'dark' });
    const transparentRule = /([^{}]+)\{[^}]*background-color: transparent/.exec(css)?.[1];

    expect(transparentRule?.trim()).toBe('body *');
  });

  it('RD-17: never filters or inverts images, and leaves fonts alone', () => {
    const css = bookCss({ fontSize: 100, theme: 'dark' });

    expect(css).not.toMatch(/filter|invert|font-family/);
  });
});
