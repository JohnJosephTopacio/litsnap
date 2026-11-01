// Acceptance criteria CHROME-4, CHROME-5 and CHROME-10 from docs/features/reader-chrome.md: which
// presses count as a click on blank space. Whether a point is on text (`isOnText`) needs real
// layout, so it's tested in Playwright.
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DRAG_PX, isBlankClick, type Press } from './blankClick';

/** A plain click on blank space: primary button, still, nothing selected, not on text or a link. */
const click = (overrides: Partial<Press> = {}): Press => ({
  button: 0,
  modifiers: false,
  clickCount: 1,
  movedPx: 0,
  hadSelection: false,
  onText: false,
  inLink: false,
  ...overrides,
});

describe('isBlankClick', () => {
  it('CHROME-4: a still, primary click on blank space counts', () => {
    expect(isBlankClick(click())).toBe(true);
  });

  it('a press that moves 5 px is a drag', () => {
    expect(DRAG_PX).toBe(5);
  });

  it('CHROME-4: a little movement is still a click; 5 px is a drag', () => {
    expect(isBlankClick(click({ movedPx: 4.9 }))).toBe(true);
    expect(isBlankClick(click({ movedPx: 5 }))).toBe(false);
  });

  it('CHROME-10: a tap counts like a click (touch reports button 0 and one click)', () => {
    expect(isBlankClick(click({ button: 0, clickCount: 1 }))).toBe(true);
  });

  it.each([
    ['on text: text stays free for selecting', { onText: true }],
    ['on a link: it is followed', { inLink: true }],
    ['while text was selected: it only clears it', { hadSelection: true }],
    ['the second click of a double-click', { clickCount: 2 }],
    ['the third click of a triple-click', { clickCount: 3 }],
    ['with the middle button', { button: 1 }],
    ['with the right button', { button: 2 }],
    ['with Ctrl, Alt, Shift or Meta', { modifiers: true }],
    ['that drags', { movedPx: 40 }],
  ] satisfies [string, Partial<Press>][])('CHROME-5: a click %s does not count', (_, overrides) => {
    expect(isBlankClick(click(overrides))).toBe(false);
  });
});
