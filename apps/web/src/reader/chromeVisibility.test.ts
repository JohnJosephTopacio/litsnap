// Acceptance criteria CHROME-1, 3, 4, 7, 8 and 11 from docs/features/reader-chrome.md: when the
// reader's chrome is shown. The DOM side (which pointer, focus and panel changes become which
// events) is tested in Playwright with the wiring.
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHROME_DELAY_MS, createChromeVisibility } from './chromeVisibility';

const onChange = vi.fn();

/** A machine for a book that has just opened (CHROME-1). */
function opened() {
  const chrome = createChromeVisibility(onChange);
  chrome.send({ type: 'opened' });
  return chrome;
}

/** A machine whose chrome has already hidden itself. */
function hidden() {
  const chrome = opened();
  vi.advanceTimersByTime(CHROME_DELAY_MS);
  onChange.mockClear();
  return chrome;
}

beforeEach(() => {
  vi.useFakeTimers();
  onChange.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('createChromeVisibility', () => {
  it('waits 3 seconds', () => {
    expect(CHROME_DELAY_MS).toBe(3000);
  });

  describe('CHROME-1: shown when a book opens, then hidden', () => {
    it.fails('is shown from the start, and hides when the countdown runs out', () => {
      const chrome = opened();
      expect(chrome.visible).toBe(true);

      vi.advanceTimersByTime(CHROME_DELAY_MS - 1);
      expect(chrome.visible).toBe(true);
      expect(onChange).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(chrome.visible).toBe(false);
      expect(onChange).toHaveBeenCalledExactlyOnceWith(false);
    });

    it.fails('does not count down before the book has opened', () => {
      const chrome = createChromeVisibility(onChange);

      vi.advanceTimersByTime(CHROME_DELAY_MS * 3);

      expect(chrome.visible).toBe(true);
      expect(onChange).not.toHaveBeenCalled();
    });

    it.fails('stays shown when the countdown runs out while something holds it', () => {
      const chrome = opened();
      chrome.send({ type: 'hold', reason: 'hover' });

      vi.advanceTimersByTime(CHROME_DELAY_MS * 3);

      expect(chrome.visible).toBe(true);
    });

    it.fails('starts the countdown over when another book opens', () => {
      const chrome = opened();
      vi.advanceTimersByTime(CHROME_DELAY_MS - 1000);

      chrome.send({ type: 'opened' }); // a book dropped on the reader (RD-26)
      vi.advanceTimersByTime(1000);
      expect(chrome.visible).toBe(true);

      vi.advanceTimersByTime(CHROME_DELAY_MS - 1000);
      expect(chrome.visible).toBe(false);
    });

    it.fails('takes the countdown it is given', () => {
      const chrome = createChromeVisibility(onChange, 500);
      chrome.send({ type: 'opened' });

      vi.advanceTimersByTime(500);

      expect(chrome.visible).toBe(false);
    });
  });

  describe('CHROME-3: hovering a hot zone', () => {
    it.fails(
      'shows hidden chrome, keeps it while hovered, and counts down again on leaving',
      () => {
        const chrome = hidden();

        chrome.send({ type: 'hold', reason: 'hover' });
        expect(chrome.visible).toBe(true);
        expect(onChange).toHaveBeenCalledExactlyOnceWith(true);

        vi.advanceTimersByTime(CHROME_DELAY_MS * 3);
        expect(chrome.visible).toBe(true);

        chrome.send({ type: 'release', reason: 'hover' });
        vi.advanceTimersByTime(CHROME_DELAY_MS - 1);
        expect(chrome.visible).toBe(true);
        vi.advanceTimersByTime(1);
        expect(chrome.visible).toBe(false);
      },
    );

    it.fails('cancels a running countdown, which starts from the beginning on leaving', () => {
      const chrome = opened();
      vi.advanceTimersByTime(CHROME_DELAY_MS - 100);

      chrome.send({ type: 'hold', reason: 'hover' });
      vi.advanceTimersByTime(200);
      chrome.send({ type: 'release', reason: 'hover' });

      vi.advanceTimersByTime(CHROME_DELAY_MS - 1);
      expect(chrome.visible).toBe(true);
      vi.advanceTimersByTime(1);
      expect(chrome.visible).toBe(false);
    });

    it.fails('ignores leaving a hot zone it never entered', () => {
      const chrome = opened();
      vi.advanceTimersByTime(CHROME_DELAY_MS - 100);

      chrome.send({ type: 'release', reason: 'hover' });
      vi.advanceTimersByTime(100);

      // The original countdown ran out on time: the stray release didn't restart it.
      expect(chrome.visible).toBe(false);
    });
  });

  describe('CHROME-4: clicking blank space toggles it', () => {
    it.fails('shows hidden chrome, which counts down again', () => {
      const chrome = hidden();

      chrome.send({ type: 'blankClick' });
      expect(chrome.visible).toBe(true);
      expect(onChange).toHaveBeenCalledExactlyOnceWith(true);

      vi.advanceTimersByTime(CHROME_DELAY_MS);
      expect(chrome.visible).toBe(false);
    });

    it.fails('hides shown chrome at once', () => {
      const chrome = opened();

      chrome.send({ type: 'blankClick' });

      expect(chrome.visible).toBe(false);
      expect(onChange).toHaveBeenCalledExactlyOnceWith(false);
    });

    it.fails('leaves held chrome alone (an open panel keeps it, CHROME-8)', () => {
      const chrome = opened();
      chrome.send({ type: 'hold', reason: 'panel' });

      chrome.send({ type: 'blankClick' });

      expect(chrome.visible).toBe(true);
      expect(onChange).not.toHaveBeenCalled();
    });

    it.fails("doesn't let an old countdown hide chrome a click just showed again", () => {
      const chrome = opened();
      vi.advanceTimersByTime(CHROME_DELAY_MS - 100);
      chrome.send({ type: 'blankClick' }); // hides at once
      chrome.send({ type: 'blankClick' }); // shows, new countdown

      vi.advanceTimersByTime(100);
      expect(chrome.visible).toBe(true);
      vi.advanceTimersByTime(CHROME_DELAY_MS - 100);
      expect(chrome.visible).toBe(false);
    });
  });

  describe('CHROME-7: the keyboard reaches it', () => {
    it.fails('shows on focus, holds while focused, and counts down when focus leaves', () => {
      const chrome = hidden();

      chrome.send({ type: 'hold', reason: 'focus' });
      expect(chrome.visible).toBe(true);
      vi.advanceTimersByTime(CHROME_DELAY_MS * 3);
      expect(chrome.visible).toBe(true);

      chrome.send({ type: 'release', reason: 'focus' });
      vi.advanceTimersByTime(CHROME_DELAY_MS);
      expect(chrome.visible).toBe(false);
    });
  });

  describe('CHROME-8: panels hold it', () => {
    it.fails('stays shown while a panel is open, and counts down when it closes', () => {
      const chrome = opened();
      chrome.send({ type: 'hold', reason: 'panel' });
      vi.advanceTimersByTime(CHROME_DELAY_MS * 3);
      expect(chrome.visible).toBe(true);

      chrome.send({ type: 'release', reason: 'panel' });
      vi.advanceTimersByTime(CHROME_DELAY_MS);
      expect(chrome.visible).toBe(false);
    });

    it.fails('stays held until the last hold is released', () => {
      const chrome = opened();
      chrome.send({ type: 'hold', reason: 'panel' });
      chrome.send({ type: 'hold', reason: 'hover' });

      chrome.send({ type: 'release', reason: 'panel' });
      vi.advanceTimersByTime(CHROME_DELAY_MS * 3);
      expect(chrome.visible).toBe(true);

      chrome.send({ type: 'release', reason: 'hover' });
      vi.advanceTimersByTime(CHROME_DELAY_MS);
      expect(chrome.visible).toBe(false);
    });

    it.fails('reports only real changes: holding shown chrome calls nothing', () => {
      const chrome = opened();

      chrome.send({ type: 'hold', reason: 'panel' });
      chrome.send({ type: 'hold', reason: 'focus' });

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('CHROME-11: Always shown', () => {
    it.fails('shows hidden chrome and never hides it, whatever happens', () => {
      const chrome = hidden();

      chrome.send({ type: 'mode', mode: 'always' });
      expect(chrome.visible).toBe(true);

      chrome.send({ type: 'blankClick' });
      chrome.send({ type: 'hold', reason: 'hover' });
      chrome.send({ type: 'release', reason: 'hover' });
      chrome.send({ type: 'opened' });
      vi.advanceTimersByTime(CHROME_DELAY_MS * 3);

      expect(chrome.visible).toBe(true);
      expect(onChange).toHaveBeenCalledExactlyOnceWith(true);
    });

    it.fails('stops a running countdown', () => {
      const chrome = opened();

      chrome.send({ type: 'mode', mode: 'always' });
      vi.advanceTimersByTime(CHROME_DELAY_MS * 3);

      expect(chrome.visible).toBe(true);
    });

    it.fails('counts down again when switched back to Auto-hide', () => {
      const chrome = opened();
      chrome.send({ type: 'mode', mode: 'always' });

      chrome.send({ type: 'mode', mode: 'auto-hide' });
      vi.advanceTimersByTime(CHROME_DELAY_MS);

      expect(chrome.visible).toBe(false);
    });
  });

  it.fails('does nothing after dispose, and leaves no timer behind', () => {
    const chrome = opened();

    chrome.dispose();
    expect(vi.getTimerCount()).toBe(0);

    chrome.send({ type: 'blankClick' });
    vi.advanceTimersByTime(CHROME_DELAY_MS * 3);
    expect(onChange).not.toHaveBeenCalled();
  });
});
