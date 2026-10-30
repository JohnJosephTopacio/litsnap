// What counts as a click on blank space in the book. Spec: docs/features/reader-chrome.md
// (CHROME-4, CHROME-5).
//
// STUB: the tests in blankClick.test.ts are `it.fails` until the implementation PR.
/* eslint-disable @typescript-eslint/no-unused-vars -- stub parameters; the implementation PR removes this */

/** A finished press in the book area, as ReaderView saw it. */
export interface Press {
  /** `PointerEvent.button`: 0 is the primary button (or a touch). */
  button: number;
  /** Ctrl, Alt, Shift or Meta was held. */
  modifiers: boolean;
  /** `MouseEvent.detail`: 2 for the second click of a double-click. */
  clickCount: number;
  /** How far the pointer moved between press and release, in CSS pixels. */
  movedPx: number;
  /** Text was selected when the press began: the click only clears it (MENU-9). */
  hadSelection: boolean;
  /** The point is inside a character's box (`isOnText`). */
  onText: boolean;
  /** The point is inside a link. */
  inLink: boolean;
}

/** Farther than this between press and release is a drag (which selects text), not a click. */
export const DRAG_PX = 5;

/** CHROME-4/5: whether a finished press counts as a click on blank space. */
export function isBlankClick(press: Press): boolean {
  throw new Error('Not implemented yet (reader-chrome.md)');
}

/**
 * Whether a point (in the document's own coordinates) is inside a character's box. Tested in
 * Playwright only: jsdom has no layout. Implemented with the wiring (reader-chrome.md, Design).
 */
export function isOnText(doc: Document, x: number, y: number): boolean {
  throw new Error('Not implemented yet (reader-chrome.md)');
}
