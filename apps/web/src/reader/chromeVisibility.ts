// When the reader's chrome is shown. Spec: docs/features/reader-chrome.md (CHROME-1, 3, 4, 7, 8, 11).
// Knows nothing about the DOM: ReaderScreen turns pointer, focus and panel changes into events.
//
// STUB: the tests in chromeVisibility.test.ts are `it.fails` until the implementation PR.
/* eslint-disable @typescript-eslint/no-unused-vars -- stub parameters; the implementation PR removes this */

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
  throw new Error('Not implemented yet (reader-chrome.md)');
}
