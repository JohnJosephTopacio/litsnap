// The Content Security Policy for every page: docs/decisions/0002-csp-for-book-content.md, with
// the lookup Worker allowed in connect-src by docs/decisions/0003-lookup-api-origin.md.
// Defined once. The build writes it to Cloudflare's `_headers`, and `vite preview` sends it, so
// Playwright tests run against the policy that ships. The dev server deliberately has none.

import { LOOKUP_ORIGIN } from './lookup';

const directives: Record<string, string[]> = {
  'default-src': ["'none'"],
  // Only our bundled JS. No 'unsafe-inline' or blob:, so scripts inside books can't run.
  'script-src': ["'self'"],
  'style-src': ["'self'", "'unsafe-inline'", 'blob:'],
  'img-src': ["'self'", 'blob:', 'data:'],
  'font-src': ["'self'", 'blob:', 'data:'],
  'frame-src': ['blob:'],
  // Our code may fetch the lookup Worker; nothing may load from it (decision 0003).
  'connect-src': ["'self'", 'blob:', LOOKUP_ORIGIN],
  'base-uri': ["'none'"],
  'form-action': ["'none'"],
  'object-src': ["'none'"],
  'frame-ancestors': ["'none'"],
};

export const CONTENT_SECURITY_POLICY = Object.entries(directives)
  .map(([name, sources]) => [name, ...sources].join(' '))
  .join('; ');

/** Cloudflare Pages `_headers` file: applies the CSP to every path. */
export function headersFile(): string {
  return `/*\n  Content-Security-Policy: ${CONTENT_SECURITY_POLICY}\n`;
}
