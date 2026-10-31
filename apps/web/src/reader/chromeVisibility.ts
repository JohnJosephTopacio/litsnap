// When the reader's chrome is shown. Spec: docs/features/reader-chrome.md (CHROME-1, 3, 4, 7, 8, 11).
// Knows nothing about the DOM: ReaderScreen turns pointer, focus and panel changes into events.

export type HoldReason = 'hover' | 'focus' | 'panel';
export type ControlsMode = 'auto-hide' | 'always';

export type ChromeEvent =
  | { type: 'opened' } // CHROME-1
  | { type: 'hold'; reason: HoldReason }
  | { type: 'release'; reason: HoldReason }
  | { type: 'blankClick' } // CHROME-4
  | { type: 'mode'; mode: ControlsMode }; // CHROME-11

export interface ChromeVisibility {
  readonly visible: boolean;
  send(event: ChromeEvent): void;
  dispose(): void;
}

/** The countdown before unheld chrome hides (reader-chrome.md, Terms). */
export const CHROME_DELAY_MS = 3000;

/** Whether the chrome is shown. Owns the countdown; calls onChange when visibility flips. */
export function createChromeVisibility(
  onChange: (visible: boolean) => void,
  delayMs = CHROME_DELAY_MS,
): ChromeVisibility {
  let visible = true;
  let mode: ControlsMode = 'auto-hide';
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const holds = new Set<HoldReason>();

  const set = (next: boolean) => {
    if (next === visible || disposed) return;
    visible = next;
    onChange(next);
  };

  const stopCountdown = () => {
    clearTimeout(timer);
    timer = undefined;
  };

  const startCountdown = () => {
    stopCountdown();
    if (mode === 'always' || holds.size > 0) return;
    // Holding, and switching to Always shown, stop the countdown, so when it runs out it can hide.
    timer = setTimeout(() => {
      timer = undefined;
      set(false);
    }, delayMs);
  };

  return {
    get visible() {
      return visible;
    },

    send(event) {
      if (disposed) return;
      switch (event.type) {
        case 'opened':
          set(true);
          startCountdown();
          break;
        case 'hold':
          holds.add(event.reason);
          stopCountdown();
          set(true);
          break;
        case 'release':
          if (!holds.delete(event.reason)) return;
          if (holds.size === 0) startCountdown();
          break;
        case 'blankClick':
          if (mode === 'always' || holds.size > 0) return;
          if (visible) {
            stopCountdown();
            set(false);
          } else {
            set(true);
            startCountdown();
          }
          break;
        case 'mode':
          // The reader sends the saved mode when it mounts: that mustn't start a countdown before
          // the book has opened (CHROME-1).
          if (event.mode === mode) return;
          mode = event.mode;
          if (mode === 'always') {
            stopCountdown();
            set(true);
          } else {
            startCountdown();
          }
          break;
      }
    },

    dispose() {
      stopCountdown();
      disposed = true;
    },
  };
}
