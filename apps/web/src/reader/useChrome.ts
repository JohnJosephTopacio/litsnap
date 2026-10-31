// The reader chrome's visibility as React state: the DOM side of docs/features/reader-chrome.md.
// The rules themselves are in createChromeVisibility; this turns pointer, focus, panel and setting
// changes into its events. Tested in Playwright (reader-chrome.spec.ts).
import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import type { Controls } from '../storage/bookStore';
import {
  createChromeVisibility,
  type ChromeEvent,
  type ChromeVisibility,
} from './chromeVisibility';

/** Marks the elements that make up the chrome: the bars and the page arrows. */
export const CHROME_PART = 'data-chrome-part';

const inChrome = (target: EventTarget | null) =>
  target instanceof Element && target.closest(`[${CHROME_PART}]`) !== null;

export function useChrome(controls: Controls, panelOpen: boolean) {
  const [visible, setVisible] = useState(true);
  const machine = useRef<ChromeVisibility>(undefined);
  // CHROME-7: only keyboard focus holds the chrome. Clicking a gutter focuses its arrow, and that
  // mustn't show the bars (CHROME-6). `:focus-visible` can't tell: a Tab pressed inside the book's
  // iframe doesn't count as keyboard focus in our page.
  const lastInput = useRef<'keyboard' | 'pointer'>('pointer');

  useEffect(() => {
    const chrome = createChromeVisibility(setVisible);
    machine.current = chrome;
    return () => {
      chrome.dispose();
      machine.current = undefined;
    };
  }, []);

  const send = useCallback((event: ChromeEvent) => {
    machine.current?.send(event);
  }, []);

  // CHROME-11.
  useEffect(() => {
    send({ type: 'mode', mode: controls });
  }, [controls, send]);

  // CHROME-8.
  useEffect(() => {
    send({ type: panelOpen ? 'hold' : 'release', reason: 'panel' });
  }, [panelOpen, send]);

  // CHROME-7.
  useEffect(() => {
    const onPointer = () => {
      lastInput.current = 'pointer';
    };
    const onKey = () => {
      lastInput.current = 'keyboard';
    };
    const onFocusIn = (event: FocusEvent) => {
      if (!inChrome(event.target)) send({ type: 'release', reason: 'focus' });
      else if (lastInput.current === 'keyboard') send({ type: 'hold', reason: 'focus' });
    };
    const onFocusOut = (event: FocusEvent) => {
      if (!inChrome(event.relatedTarget)) send({ type: 'release', reason: 'focus' });
    };
    window.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      window.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, [send]);

  /** CHROME-3: the props for a hot zone (the top and bottom bars). Touches never hover (CHROME-10). */
  const hotZone = {
    onPointerEnter: (event: PointerEvent) => {
      if (event.pointerType !== 'touch') send({ type: 'hold', reason: 'hover' });
    },
    onPointerLeave: (event: PointerEvent) => {
      if (event.pointerType !== 'touch') send({ type: 'release', reason: 'hover' });
    },
  };

  /** A key pressed inside the book's iframe, which our window never sees. */
  const noteKeyboard = useCallback(() => {
    lastInput.current = 'keyboard';
  }, []);

  return { visible, send, hotZone, noteKeyboard };
}
