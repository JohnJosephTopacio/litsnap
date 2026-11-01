// What counts as a click on blank space in the book. Spec: docs/features/reader-chrome.md
// (CHROME-4, CHROME-5).

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
  /** The point is inside a link or a form control: following or using it is the click's job. */
  inLink: boolean;
}

/** Farther than this between press and release is a drag (which selects text), not a click. */
export const DRAG_PX = 5;

/** CHROME-4/5: whether a finished press counts as a click on blank space. */
export function isBlankClick(press: Press): boolean {
  return (
    press.button === 0 &&
    !press.modifiers &&
    press.clickCount <= 1 &&
    press.movedPx < DRAG_PX &&
    !press.hadSelection &&
    !press.onText &&
    !press.inLink
  );
}

/**
 * Whether a point (in the document's own coordinates) is inside a character's box. The caret
 * alone isn't enough: on blank space the browser snaps to the nearest text, so the character on
 * either side of it must actually be under the point. Tested in Playwright: jsdom has no layout.
 */
export function isOnText(doc: Document, x: number, y: number): boolean {
  // The standard API: Chrome 128+, Firefox, Safari 18.4+.
  const caret = doc.caretPositionFromPoint(x, y);
  // nodeType, never instanceof: the book's nodes belong to its iframe's realm (CLAUDE.md).
  if (caret?.offsetNode.nodeType !== Node.TEXT_NODE) return false;
  const length = caret.offsetNode.textContent?.length ?? 0;
  const range = doc.createRange();
  for (const start of [caret.offset - 1, caret.offset]) {
    if (start < 0 || start >= length) continue;
    range.setStart(caret.offsetNode, start);
    range.setEnd(caret.offsetNode, start + 1);
    for (const box of range.getClientRects()) {
      if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) return true;
    }
  }
  return false;
}
