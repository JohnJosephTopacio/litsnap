# Feature: EPUB reader

> Milestone: M1 · Status: proposed · Product spec: [spec.md §3, §6–7](../spec.md#6-reader-features-v1) · Decisions: [0001 vendor foliate-js](../decisions/0001-vendor-foliate-js.md), [0002 CSP](../decisions/0002-csp-for-book-content.md)

## Goal

Open a DRM-free EPUB from the user's computer and read it comfortably: table of contents, font size, light/dark theme, paginated or scrolled layout. Reopening LitSnap returns to the same book and place. Depends on [drm-detection.md](drm-detection.md) and [book-storage.md](book-storage.md).

## Screens

There are two views and no router (the router arrives in M6 with the library page):

1. **Open screen**: "Open a book" button (file picker, `accept=".epub,application/epub+zip"`) and a drop zone covering the page. It also shows any error message from the last attempt.
2. **Reader**:
   - Top bar: TOC button and book title on the left. Settings button and "Open another book" on the right.
   - Settings popover: font size − / + with the current %, Light/Dark toggle, Paginated/Scrolled toggle.
   - Bottom bar: progress % and current chapter title.
   - Prev/next arrows at the page edges.

Visual styling is test-after polish and not part of the criteria below. The chrome must fit at 375 px wide.

## Opening a book

```
file ─▶ .epub? ─no─▶ "Only EPUB files are supported for now."
          │yes
          ▼
   inspectEpub ─drm─────▶ DRM message + links      (not stored)
          │    ─invalid─▶ "couldn't be opened"     (not stored)
          │ok
          ▼
   hash → open in foliate → save book (quota error → open unsaved + message)
        → set current → go to saved position
```

A loading state shows from file selection until the first page renders.

If a book is already open and the newly chosen file is rejected (RD-3…5), the open book **stays open** and the message shows above it, so a mis-click doesn't cost the reader their place.

## Acceptance criteria

Verified with Playwright (Chromium) against `vite preview`, so the production CSP applies. Fixtures are in `apps/web/e2e/fixtures/`.

### Opening

**RD-1: open via picker**
Given the open screen
When the user picks the Standard Ebooks fixture
Then the first page renders and the top bar shows the book's title.

**RD-2: open via drag-and-drop**
Given the open screen
When the fixture is dropped on the page
Then the book opens as in RD-1.

**RD-3: unsupported file**
Given the open screen
When a `.pdf` or `.txt` file is picked or dropped
Then _"Only EPUB files are supported for now."_ is shown and nothing is stored.

**RD-4: DRM-protected book**
Given the `fake-drm.epub` fixture (contains `rights.xml`)
When it is opened
Then _"This book is DRM-protected and can't be opened."_ is shown with links to Project Gutenberg and Standard Ebooks, and nothing is stored.

**RD-5: invalid EPUB**
Given the `corrupt.epub` fixture
When it is opened
Then _"This file couldn't be opened as an EPUB."_ is shown and nothing is stored.

**RD-6: storage full**
Given saving the book fails with `StorageFullError`
When a valid book is opened
Then the book still opens, and _"Not enough browser storage to save this book."_ is shown.

**RD-7: open another book**
Given a book is open
When the user chooses "Open another book" and picks a different EPUB
Then the new book opens and becomes the current book.

**RD-26: drop onto the reader**
Given a book is open
When an EPUB is dropped anywhere on the reader, including onto the book's page itself
Then it opens as with "Open another book" (RD-7), and the browser doesn't navigate away to the dropped file.

### Position and reopening

**RD-8: reopen at saved position**
Given the user read to chapter 3, then reloaded the page
When the app starts
Then the same book opens at the same position, without the open screen appearing.

**RD-9: CFI no longer resolves**
Given saved progress whose `cfi` can't be resolved
When the book reopens
Then it opens at the saved `fraction` instead.

**RD-10: current book missing**
Given `currentBookId` refers to a book that's no longer stored
When the app starts
Then the open screen shows, with no error message.

**RD-11: stored book is broken**
Given the stored blob for the current book fails to open
When the app starts
Then the open screen shows _"This book couldn't be reopened. Please open the file again."_

### Navigation

**RD-12: keyboard and buttons**
Given paginated layout
When the user presses → / PageDown or clicks the next arrow
Then the next page shows. ← / PageUp and the previous arrow go back.

**RD-13: table of contents**
Given a book is open
When the user opens the TOC panel and selects a chapter
Then the reader jumps to that chapter and the panel closes. The current chapter is highlighted in the panel. `Esc` closes the panel.

**RD-14: progress indicator**
Given a book is open
When the user moves through it
Then the bottom bar shows the progress % and the current chapter title.

### Settings

**RD-15: font size**
Given font size 100%
When the user presses + twice
Then text renders at 120%, and the setting survives a reload. The − button is disabled at 80% and + at 200%.

**RD-16: theme**
Given no saved theme and an OS dark-mode preference
When a book opens
Then the dark theme is used. After the user picks Light, light is used regardless of the OS, including after a reload.

**RD-17: theme overrides publisher colours**
Given a book whose CSS sets its own text and background colours
When either theme is active
Then the theme's text and background colours win. The publisher's fonts and layout are kept, and images are not inverted.

**RD-18: layout**
Given paginated layout
When the user switches to Scrolled
Then the book scrolls vertically, the position is kept, and the setting survives a reload.

### Links

**RD-19: internal links**
Given a book with a footnote link
When the user clicks it
Then the reader navigates to the footnote.

**RD-20: external links**
Given a book with an `https://` link
When the user clicks it
Then it opens in a new tab with `rel="noopener noreferrer"`, and the reader stays on the same page. Links with any other scheme do nothing.

### Security ([decision 0002](../decisions/0002-csp-for-book-content.md))

**RD-21: scripts in books never run** _(required test, see below)_
Given the `scripted.epub` fixture, which tries to run code via an inline `<script>`, an `<img onerror>`, a `javascript:` link and a `blob:` script, each setting a marker on `window.top` and in `localStorage`
When the book is opened and the link is clicked
Then no marker is set.

**RD-22: remote resources are blocked**
Given a book that references an image on a remote `https://` URL
When the page renders
Then no request is made to that host.

**RD-23: CSP header is present**
Given the built app served by `vite preview`
When `/` is requested
Then the response carries the `Content-Security-Policy` header from decision 0002, identical to the one in the built `_headers` file.

**RD-24: book text is shown as text, never HTML**
Given a book whose title, author and chapter names contain HTML (e.g. `<img src=x onerror=alert(1)>`)
When it is opened
Then the top bar, TOC panel and bottom bar show those strings as literal text, and no element is created from them.

**RD-25: HTML-injection APIs are banned by lint**
Given app code (not `vendor/`) that uses `dangerouslySetInnerHTML`, assigns `innerHTML`/`outerHTML`, or calls `insertAdjacentHTML` or `document.write`
When `pnpm lint` runs
Then it fails. A specific exception needs an `eslint-disable` comment with a reason and is called out in the PR.

RD-21 is what stops anyone from loosening the CSP later without noticing. It must never be skipped or weakened without a new decision record. RD-24 and RD-25 cover the part the CSP doesn't: our own UI. The CSP protects the book's iframes, but if our interface inserted a book's chapter title as HTML, that would be a separate hole.

## Fixtures

- **Standard Ebooks:** _The Strange Case of Dr. Jekyll and Mr. Hyde_ (CC0), committed unmodified as `apps/web/e2e/fixtures/jekyll-and-hyde.epub`. It has a cover, a TOC and an external link in the colophon. It does **not** embed fonts or use font obfuscation (an earlier draft of this spec assumed it would), so font obfuscation is covered by the DRM-2 unit tests instead.
- **Every other test book** (`scripted`, `remote-image`, `hostile-title`, `links`, and later `fake-drm`, `encrypted`, `corrupt`, and footnotes) is built **in memory** by `apps/web/e2e/fixtures.ts`, using the same builder as the unit tests (`src/epub/testing/buildEpub.ts`). There are no generated binary files to commit, and each test shows exactly what its book contains.

## Notes for implementation

- foliate-js is vendored per [decision 0001](../decisions/0001-vendor-foliate-js.md). foliate, the CSP and RD-21 land in the **same PR**: foliate must never reach `main` without the CSP.
- The Vite **dev** server runs without the CSP (React Fast Refresh needs an inline script). The README must warn against opening untrusted books in `pnpm dev`.
- The reader flushes the progress saver on `visibilitychange` → hidden.
- Mobile: rely on foliate's built-in swipe handling. No mobile Playwright project in M1.

## Out of scope

- Library page, removing books, lookup history (M6).
- Text selection and lookups (M2+).
- PDF (M5).
- Custom fonts, line spacing, margins.
