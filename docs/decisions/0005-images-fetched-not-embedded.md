# 0005: Lookup images are fetched by our code, not embedded

- Status: accepted
- Date: 2026-10-28
- Feature: [image-grid.md](../features/image-grid.md)
- Updates: [0002](0002-csp-for-book-content.md), which expected M4 to add Wikimedia's image host to `img-src`

## Context

The lookup modal shows images from Wikimedia Commons ([image-providers.md](../features/image-providers.md)). Our CSP's `img-src` is `'self' blob: data:` (decision 0002), so an `<img src="https://upload.wikimedia.org/…">` is blocked.

The obvious fix is adding `https://upload.wikimedia.org` to `img-src`. But **books inherit our CSP**: foliate renders them in `blob:` iframes, and those take the policy of the page that made them. So anything `img-src` allows, books may load too. Today a book can't load any remote image, which is what stops tracking pixels, and spec §7 promises it.

There were three options (M4 grilling, Q1 and Q9):

| Option                                                      | Books can then load…   | Cost                                                                                                       |
| ----------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| A. `img-src` allows Wikimedia                               | any Wikimedia image    | none, but breaks spec §7's promise                                                                         |
| B. Proxy images through our Worker                          | images from our Worker | Worker requests (Free plan: 100,000 a day), bandwidth, and the Worker's origin ends up in `img-src` anyway |
| **C. Our code downloads the bytes and shows a `blob:` URL** | **nothing new**        | ~30 lines of code; no browser lazy loading; depends on Wikimedia sending CORS headers                      |

## Decision

**C.** Add `https://upload.wikimedia.org` to **`connect-src`** only. Our code `fetch`es each thumbnail, makes a `blob:` URL with `URL.createObjectURL`, and shows that. `img-src` already allows `blob:`.

### Why it works

- `connect-src` controls what **scripts** may fetch. Scripts in books never run (`script-src 'self'`, RD-21), so allowing a host there gives books nothing. The same reasoning let the Worker into `connect-src` (decision 0003).
- `upload.wikimedia.org` sends `Access-Control-Allow-Origin: *`, so our page may read the bytes. Its newer twin `thumb.wikimedia.org`, which the APIs now return, **doesn't** (probed 2026-10-27). So the Worker gives us URLs on `upload.wikimedia.org` (image-providers IMG-9).
- Downloads send no cookies (`credentials: 'omit'`) and no referrer (`referrerPolicy: 'no-referrer'`).

### Trade-offs we accept

- **Wikimedia sees the reader's IP address** and which images were downloaded, so it could guess the looked-up word. That's what any site showing Commons images does, and the Wikimedia Foundation's privacy policy covers it. Spec §7 and the Terms page now say so. Option B would have hidden it, at a cost the Free plan can't comfortably carry.
- **A book's `<a ping="https://upload.wikimedia.org/…">`** could, in principle, make the browser send an empty POST there when a link is clicked, because `ping` is also governed by `connect-src`. foliate cancels book link clicks and we re-route them (CLAUDE.md, "All navigation…"), and the request would carry nothing from the book. This was already true for the Worker's origin (decision 0003).
- **If Wikimedia stops sending CORS headers** on `upload.wikimedia.org`, images stop loading and the grid shows _"No good image found."_ The weekly live check (CLIENT-12) tests that header, so we'd know within a week. The fallback is option A, with its own decision record.

## Consequences

- `apps/web/config/csp.ts`: `connect-src 'self' blob: <Worker> https://upload.wikimedia.org`. `img-src` is unchanged.
- RD-22 gains a case: a book's image on `upload.wikimedia.org` is still blocked.
- Any later image source must be fetched the same way, and its host added to `connect-src` in a reviewed PR. It must never go in `img-src` without a new decision.
