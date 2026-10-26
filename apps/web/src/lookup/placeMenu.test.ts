// Acceptance criteria MENU-4…6 from docs/features/selection-menu.md.
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { MENU_GAP, MENU_INSET, placeMenu, type Box } from './placeMenu';

const box = (left: number, top: number, width: number, height: number): Box => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
});

const bounds = box(100, 50, 800, 600); // right 900, bottom 650
const size = { width: 120, height: 90 };
const line = (left: number, top: number, width = 80) => box(left, top, width, 20);

const overlaps = (a: Box, b: Box) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const menuBox = ({ left, top }: { left: number; top: number }) =>
  box(left, top, size.width, size.height);

describe('placeMenu', () => {
  describe('MENU-4: beside the end of the selection', () => {
    it('goes 8 px right of the selection, level with its line', () => {
      const selected = line(300, 200);
      expect(placeMenu({ first: selected, last: selected, bounds }, size)).toEqual({
        left: selected.right + MENU_GAP,
        top: 200,
      });
    });

    it('uses the last line of a selection over two lines', () => {
      const first = line(700, 200, 150);
      const last = line(120, 224, 60);
      expect(placeMenu({ first, last, bounds }, size)).toEqual({
        left: last.right + MENU_GAP,
        top: 224,
      });
    });

    it('stays on the right when it fits exactly', () => {
      // right edge of the menu = bounds.right - inset
      const right = bounds.right - MENU_INSET - size.width - MENU_GAP;
      const selected = line(right - 80, 200);
      expect(placeMenu({ first: selected, last: selected, bounds }, size).left).toBe(
        right + MENU_GAP,
      );
    });
  });

  describe('MENU-5: flipped to the left near the right edge', () => {
    it('goes 8 px left of where the selection starts, level with its first line', () => {
      const selected = line(bounds.right - MENU_INSET - size.width - MENU_GAP - 79, 200);
      expect(placeMenu({ first: selected, last: selected, bounds }, size)).toEqual({
        left: selected.left - MENU_GAP - size.width,
        top: 200,
      });
    });

    it('uses the start of a selection over two lines', () => {
      const first = line(500, 200, 380);
      const last = line(120, 224, 760);
      expect(placeMenu({ first, last, bounds }, size)).toEqual({
        left: first.left - MENU_GAP - size.width,
        top: 200,
      });
    });
  });

  describe('MENU-6: kept inside the reader area', () => {
    it('moves up near the bottom', () => {
      const selected = line(300, bounds.bottom - 30);
      expect(placeMenu({ first: selected, last: selected, bounds }, size).top).toBe(
        bounds.bottom - MENU_INSET - size.height,
      );
    });

    it('moves down near the top', () => {
      const selected = line(300, bounds.top);
      expect(placeMenu({ first: selected, last: selected, bounds }, size).top).toBe(
        bounds.top + MENU_INSET,
      );
    });

    it('goes below the selection when neither side has room', () => {
      const selected = line(bounds.left + 10, 200, 780);
      const placed = placeMenu({ first: selected, last: selected, bounds }, size);
      expect(placed.top).toBe(selected.bottom + MENU_GAP);
      expect(placed.left).toBeGreaterThanOrEqual(bounds.left + MENU_INSET);
      expect(placed.left + size.width).toBeLessThanOrEqual(bounds.right - MENU_INSET);
      expect(overlaps(menuBox(placed), selected)).toBe(false);
    });

    it('goes above the selection when there is no room below either', () => {
      const first = line(bounds.left + 10, 500, 780);
      const last = line(bounds.left + 10, 560, 780);
      const placed = placeMenu({ first, last, bounds }, size);
      expect(placed.top).toBe(first.top - MENU_GAP - size.height);
      expect(overlaps(menuBox(placed), first)).toBe(false);
      expect(overlaps(menuBox(placed), last)).toBe(false);
    });

    it('never covers the selection wherever it is', () => {
      for (let left = bounds.left; left < bounds.right - 80; left += 37) {
        for (let top = bounds.top; top < bounds.bottom - 20; top += 41) {
          const selected = line(left, top);
          const placed = menuBox(placeMenu({ first: selected, last: selected, bounds }, size));
          expect(overlaps(placed, selected)).toBe(false);
          expect(placed.left).toBeGreaterThanOrEqual(bounds.left + MENU_INSET);
          expect(placed.right).toBeLessThanOrEqual(bounds.right - MENU_INSET);
          expect(placed.top).toBeGreaterThanOrEqual(bounds.top + MENU_INSET);
          expect(placed.bottom).toBeLessThanOrEqual(bounds.bottom - MENU_INSET);
        }
      }
    });
  });
});
