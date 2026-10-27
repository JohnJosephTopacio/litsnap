# 0003: The web app calls the Worker on its own origin

- Status: accepted
- Date: 2026-10-27
- Feature: [lookup-client.md](../features/lookup-client.md)
- Changes: [0002](0002-csp-for-book-content.md) (`connect-src`)

## Context

The reader is served from `https://litsnap.pages.dev`, and the Worker answers on `https://litsnap-worker.johnjoseph-topacio-110503.workers.dev` ([lookup-api.md](../features/lookup-api.md)). Those are different origins.

Decision 0002's CSP only allows `connect-src 'self' blob:`, so today the browser blocks any `fetch` to the Worker. CLAUDE.md requires a decision record to loosen the CSP.

The options:

1. **Call the Worker cross-origin.** Add its exact origin to `connect-src`. The Worker already sends CORS headers only to our pages (API-15).
2. **Same-origin `/api/lookup`** through a Pages Function that forwards to the Worker. The CSP stays as it is, but it's a second piece to deploy and test. Pages Functions count against the same Free-plan request quota, so every lookup would be billed twice against it.
3. **A custom domain** (`litsnap.example`), with the Worker on a route under it. That costs money for the domain, and the owner wants to stay free.

## Decision

Option 1. `connect-src` becomes `'self' blob: https://litsnap-worker.johnjoseph-topacio-110503.workers.dev`. That's the exact origin, with no wildcard. It's defined once in `apps/web/config/lookup.ts` (`LOOKUP_ORIGIN`), and both the CSP and the production client read it, so they can't drift apart (CLIENT-8).

Nothing else in the CSP changes: `script-src 'self'`, `img-src`, `style-src`, `font-src` and `frame-src` are as before.

## Why

- **`connect-src` only governs `fetch`, XHR, WebSocket and `EventSource`.** It doesn't let anything _load_ from the Worker: no images, stylesheets, fonts or frames. So books still can't pull remote resources or tracking pixels (decision 0002).
- **Book content still can't call the Worker.** A book's `blob:` iframe inherits our CSP, so in theory it could `fetch` the Worker too, but only a script could make that call, and `script-src 'self'` stops book scripts running (RD-21). Even if one ran, all it could do is make a lookup, which anyone can already do with `curl`.
- **One exact origin is easy to review.** If the Worker ever moves, the CSP has to change on purpose, with a test showing it.
- **CORS is a separate thing.** The CSP decides where _our page_ may send requests. CORS (API-15) decides which _pages_ may read the Worker's answers. We need both.

## Consequences

- Every lookup is a cross-origin `GET` with no custom headers and no credentials (CLIENT-1, CLIENT-6). That's a CORS "simple request", so there's no preflight `OPTIONS` round trip.
- The Worker's address is now part of the CSP. Renaming the Worker or moving it to a custom domain means changing `LOOKUP_ORIGIN`, the CSP test and this record.
- `pnpm dev` has no CSP (decision 0002) and talks to `http://localhost:8787` (`wrangler dev`), or to `VITE_LOOKUP_URL` if set.
- The CSP test that said "no remote hosts at all" now says "only the Worker, and only in `connect-src`".
