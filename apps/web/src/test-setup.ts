import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom doesn't implement matchMedia. A light-mode stub: the theme hook only needs `matches` and
// listeners. (Guarded because test files using the node environment run this setup too.)
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string): Partial<MediaQueryList> => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
}

// jsdom has no <dialog> methods. A stand-in with what LookupModal relies on: open/close and the
// `close` event. Esc, the ::backdrop and inertness are tested in Playwright, in a real browser.
if (typeof HTMLDialogElement !== 'undefined' && !('showModal' in HTMLDialogElement.prototype)) {
  Object.assign(HTMLDialogElement.prototype, {
    showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    },
    close(this: HTMLDialogElement) {
      if (!this.hasAttribute('open')) return;
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    },
  });
}

afterEach(() => {
  cleanup();
});
