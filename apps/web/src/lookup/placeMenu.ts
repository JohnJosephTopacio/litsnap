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

// RED: stub until the implementation commit.
export const placeMenu: (
  anchor: MenuAnchor,
  size: { width: number; height: number },
) => { left: number; top: number } = () => {
  throw new Error('placeMenu is not implemented yet');
};
