// Where the selection menu goes. Spec: docs/features/selection-menu.md (MENU-4…6).

/** A rectangle in our page's viewport coordinates (like `DOMRect`, without width and height). */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface MenuAnchor {
  /** The selection's first and last line (the same box for a one-line selection). */
  first: Box;
  last: Box;
  /** The reader area. */
  bounds: Box;
}

/** Space between the selection and the menu. */
export const MENU_GAP = 8;
/** How far inside the reader area the menu always stays. */
export const MENU_INSET = 8;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

/**
 * Right of the selection's end; else left of its start; else below it; else above it. Beside the
 * selection, the menu slides up or down to stay inside; below or above, it slides sideways.
 */
export function placeMenu(
  { first, last, bounds }: MenuAnchor,
  { width, height }: { width: number; height: number },
): { left: number; top: number } {
  const minLeft = bounds.left + MENU_INSET;
  const maxLeft = bounds.right - MENU_INSET - width;
  const minTop = bounds.top + MENU_INSET;
  const maxTop = bounds.bottom - MENU_INSET - height;

  const right = last.right + MENU_GAP;
  if (right <= maxLeft) return { left: right, top: clamp(last.top, minTop, maxTop) };

  const left = first.left - MENU_GAP - width;
  if (left >= minLeft) return { left, top: clamp(first.top, minTop, maxTop) };

  const below = last.bottom + MENU_GAP;
  const belowLeft = clamp(last.right - width, minLeft, maxLeft);
  if (below <= maxTop) return { left: belowLeft, top: below };

  const above = first.top - MENU_GAP - height;
  if (above >= minTop) return { left: clamp(first.left, minLeft, maxLeft), top: above };

  // A selection filling the whole reader area: nowhere is free, so stay inside at least.
  return { left: belowLeft, top: maxTop };
}
