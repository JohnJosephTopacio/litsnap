# 0002: Content Security Policy for book content

- Status: accepted
- Date: 2026-10-23
- Feature: [epub-reader.md](../features/epub-reader.md)

## Context

EPUBs are HTML, and HTML can contain scripts. LitSnap opens books from anywhere, so book content is **untrusted**.

The foliate-js README is explicit:

> Do NOT use this library (or any other e-book library, for that matter) without CSP unless you completely trust the content you're rendering or can block scripts by other means.

The reasons:

- foliate renders each section in an iframe from a **same-origin `blob:` URL**.
- Because of WebKit bug 218086, those iframes need `allow-scripts`, which "renders iframe sandbox useless".

Without a CSP, a script inside a book would run **as LitSnap**. It could read every stored book, progress and setting in IndexedDB, and later make lookup requests in the user's name.

## Decision

Serve this Content Security Policy on every page:

```
default-src 'none';
script-src 'self';
style-src 'self' 'unsafe-inline' blob:;
img-src 'self' blob: data:;
font-src 'self' blob: data:;
frame-src blob:;
connect-src 'self' blob:;
base-uri 'none';
form-action 'none';
object-src 'none';
frame-ancestors 'none'
```

### Why it works

- `blob:` documents **inherit the CSP of the page that created them**, so the policy also applies inside foliate's iframes.
- `script-src 'self'` with no `'unsafe-inline'` and no `blob:` blocks `<script>` tags, inline handlers (`onerror=`, `onclick=`), `javascript:` URLs and blob-URL scripts. Only our own bundled JS can run.
- Leaving `https:` out of `img-src`, `font-src`, `style-src` and `connect-src` means a book **can't load remote resources**. That stops tracking pixels and keeps the promise that the book never leaves the browser. A rare book that hot-links images will show them broken. We accept that.

### Trade-offs we accept

- `style-src 'unsafe-inline'`: EPUBs and foliate both rely on inline styles. CSS can't run code, and with remote loads blocked it can't exfiltrate data via `url()` either. The remaining risk (visual spoofing inside the book's own frame) is low.
- If foliate's bundled zip.js needs a worker, `worker-src 'self' blob:` will be added in the implementation PR and flagged for review.

## Delivery

- The policy string is defined **once** in `apps/web` code.
- **Production:** written to `dist/_headers` at build time, and served by Cloudflare Pages as an HTTP header. The header form is required for `frame-ancestors`, which `<meta>` CSP ignores.
- **Playwright:** the same string is set as `preview.headers` in Vite config, so end-to-end tests run against the real policy (RD-21–RD-23).
- **Dev server:** no CSP, because React Fast Refresh injects an inline script. The README warns: don't open untrusted books in `pnpm dev`.

## Consequences

- Each later milestone that talks to the network widens the policy explicitly, in a reviewed PR:
  - M3 adds the Worker origin to `connect-src`.
  - M4 adds Wikimedia's image host to `img-src`.
  - M6 adds Cloudflare Web Analytics.
- RD-21 (scripts in books never run) is a required test. Weakening `script-src` needs a new decision record.
