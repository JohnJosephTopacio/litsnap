// Acceptance criteria MENU-1, MENU-3 and MENU-10 from docs/features/selection-menu.md: when the
// menu is shown and hidden. Whether a selection qualifies (MENU-2) is up to `show`.
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSelectionWatcher, SETTLE_MS } from './selectionWatcher';

let selection = '';
const show = vi.fn();
const hide = vi.fn();
const watcher = () => createSelectionWatcher({ key: () => selection, show, hide });

beforeEach(() => {
  vi.useFakeTimers();
  selection = '';
  show.mockClear();
  hide.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('createSelectionWatcher', () => {
  describe('MENU-1: a mouse selection', () => {
    it('shows nothing while the button is down, then shows on release', () => {
      const w = watcher();
      w.pointerDown();
      selection = 'hipped';
      w.selectionChange();
      selection = 'hipped roof';
      w.selectionChange();
      vi.advanceTimersByTime(SETTLE_MS * 3);
      expect(show).not.toHaveBeenCalled();

      w.pointerUp();
      expect(show).toHaveBeenCalledTimes(1);
    });

    it('ignores a selectionchange for the same selection after release (no flicker)', () => {
      const w = watcher();
      w.pointerDown();
      selection = 'hipped roof';
      w.pointerUp();
      hide.mockClear();

      w.selectionChange();
      vi.advanceTimersByTime(SETTLE_MS);
      expect(hide).not.toHaveBeenCalled();
      expect(show).toHaveBeenCalledTimes(1);
    });

    it('hides when a click clears the selection', () => {
      const w = watcher();
      selection = 'hipped roof';
      w.pointerUp();
      w.pointerDown();
      selection = '';
      w.selectionChange();
      expect(hide).toHaveBeenCalled();
      w.pointerUp();
      expect(show).toHaveBeenCalledTimes(1);
    });

    it('hides instead of showing when released with nothing selected', () => {
      const w = watcher();
      w.pointerDown();
      w.pointerUp();
      expect(show).not.toHaveBeenCalled();
      expect(hide).toHaveBeenCalled();
    });
  });

  describe('MENU-3: selections made without the mouse', () => {
    it('shows once the selection has been still for 300 ms', () => {
      const w = watcher();
      selection = 'hipped';
      w.selectionChange();
      vi.advanceTimersByTime(SETTLE_MS - 1);
      expect(show).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(show).toHaveBeenCalledTimes(1);
    });

    it('waits while the selection keeps changing, and hides meanwhile', () => {
      const w = watcher();
      selection = 'h';
      w.selectionChange();
      vi.advanceTimersByTime(SETTLE_MS - 50);
      selection = 'hi';
      w.selectionChange();
      expect(hide).toHaveBeenCalled();
      vi.advanceTimersByTime(SETTLE_MS - 50);
      expect(show).not.toHaveBeenCalled();
      vi.advanceTimersByTime(50);
      expect(show).toHaveBeenCalledTimes(1);
    });

    it('hides at once, and shows nothing later, when the selection is cleared', () => {
      const w = watcher();
      selection = 'hipped';
      w.selectionChange();
      selection = '';
      w.selectionChange();
      expect(hide).toHaveBeenCalled();
      vi.advanceTimersByTime(SETTLE_MS * 2);
      expect(show).not.toHaveBeenCalled();
    });
  });

  describe('MENU-10: the book moving', () => {
    it('hides at once and looks again 300 ms after the last move', () => {
      const w = watcher();
      selection = 'hipped roof';
      w.pointerUp();
      hide.mockClear();

      w.relocated();
      expect(hide).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(SETTLE_MS - 1);
      w.relocated();
      vi.advanceTimersByTime(SETTLE_MS - 1);
      expect(show).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1);
      expect(show).toHaveBeenCalledTimes(2);
    });

    it('waits for the release when the book moves during a drag', () => {
      const w = watcher();
      w.pointerDown();
      selection = 'hipped roof';
      w.selectionChange();
      w.relocated();
      vi.advanceTimersByTime(SETTLE_MS * 3);
      expect(show).not.toHaveBeenCalled();
      w.pointerUp();
      expect(show).toHaveBeenCalledTimes(1);
    });
  });

  it('shows nothing after dispose', () => {
    const w = watcher();
    selection = 'hipped';
    w.selectionChange();
    w.dispose();
    vi.advanceTimersByTime(SETTLE_MS * 2);
    expect(show).not.toHaveBeenCalled();
  });
});
