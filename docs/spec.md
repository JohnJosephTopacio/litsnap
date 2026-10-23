# LitSnap — Product Spec (v1)

> Status: agreed 2026-10-21. Changes to this file go through a PR like any other change.

## 1. Problem

When reading a novel or document, readers hit unfamiliar words — especially physical descriptions like _"hipped roof"_ or _"flying buttress"_. Looking them up means leaving the book, opening a browser tab, and searching for definitions and images. That breaks immersion.

## 2. Product

LitSnap is a web-based reader for EPUB and PDF files. The reader highlights a word or short phrase and gets a definition, images, or both — in an overlay, without leaving the page.

**Audience:** a free public product, and a portfolio piece. A premium tier may come later (see §9).

**v1 constraints:** desktop first (mobile must not break, but isn't polished), English only, no user accounts, free only.

## 3. Supported files

| Input                       | v1 behaviour                                                                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| EPUB (DRM-free)             | Fully supported                                                                                                                         |
| PDF with a text layer       | Supported                                                                                                                               |
| Scanned PDF (no text layer) | Opens, shows: _"This PDF has no selectable text, so lookups aren't available."_ No OCR.                                                 |
| DRM-protected EPUB/PDF      | Rejected with: _"This book is DRM-protected and can't be opened."_ plus links to DRM-free sources (Project Gutenberg, Standard Ebooks). |

LitSnap never contains DRM-circumvention code.

## 4. Lookup experience

### 4.1 Selection → menu

- Selecting **1–6 words** shows a small **vertical menu** next to the end of the selection: **Definition**, **Image**, **Both**.
- The menu flips sides to stay on screen.
- Selections of 0 or 7+ words show no menu.
- Keyboard: with a selection active, `D` / `I` / `B` choose Definition / Image / Both.
- `Esc` or clicking elsewhere dismisses the menu.

### 4.2 Lookup modal

- Opens **centred**, smaller than the viewport; the page behind is **dimmed**. The selection stays highlighted underneath.
- Size: **Small / Medium / Large**. Default Medium. Changeable in Settings and via S/M/L buttons in the modal corner; the last choice becomes the new default.
- Header shows the looked-up term and the **source sentence** it came from.
- Dismissed by `Esc` or clicking the dimmed backdrop. Focus is trapped inside while open and returns to the reader on close.

### 4.3 Definition content

- Part of speech, definitions, and source attribution.
- If no dictionary entry exists, falls back to the Wikipedia article summary (if any).

### 4.4 Image content

- Grid of up to **6 thumbnails**; click to enlarge within the modal.
- Every image shows an **attribution line** (author, licence, source link) — required by CC BY-SA.
- Alt text comes from the image caption/description.
- If nothing suitable is found: _"No good image found."_ — never show a wrong or unrelated image just to fill the space.

### 4.5 Always available

- A **"Search Google ↗"** link (opens a new tab) as a manual fallback.

## 5. Lookup chain

1. **Normalise** the selection: trim, strip surrounding punctuation, lowercase, collapse whitespace, treat hyphens as spaces (`"Hipped-Roof,"` → `hipped roof`).
2. **Dictionary:** Wiktionary (REST API), then dictionaryapi.dev.
3. **Wikipedia search** (follows redirects, e.g. `hipped roof` → _Hip roof_): article summary and its lead images.
4. **Wikimedia Commons** image search when the article gives too few images.
5. Nothing found → empty states as in §4.3/§4.4, plus the Google link.

Lookup is **plain** — no AI, no context disambiguation in v1. The source sentence is shown so the reader can judge meaning.

Sources are implemented as pluggable **providers** behind the Worker (e.g. `wiktionary`, `wikipedia`, `commons`), so new providers — including premium ones — can be added without restructuring.

## 6. Reader features (v1)

- **Library page:** list of the user's books, open/remove.
- Table of contents, remembers reading position per book.
- **EPUB:** font size, theme (light/dark), paginated or scrolled layout.
- **PDF:** zoom, optional inverted dark mode.
- **Lookup history:** per-book list of looked-up terms ("Words from this book").
- **Pages:** Terms (incl. "only open files you have the right to read") and Privacy ("your books never leave your device").

Out of scope for v1: notes, bookmarks, user highlights, sync, accounts, mobile-polished selection, OCR, AI lookups, non-English.

## 7. Privacy & data

- Books, reading progress, settings, and lookup history live **only in the user's browser** (IndexedDB). Books are never uploaded.
- The Worker only ever receives the normalised lookup term — never book content beyond that.
- Book content is untrusted. A Content Security Policy stops scripts inside books from running and blocks books from loading remote resources (e.g. tracking pixels). See [decision 0002](decisions/0002-csp-for-book-content.md).
- Analytics: Cloudflare Web Analytics (cookieless, no consent banner needed).

## 8. Architecture

```
Browser (Cloudflare Pages)                    Cloudflare Worker (Hono)
┌──────────────────────────────┐              ┌──────────────────────────┐
│ React + Vite + TypeScript    │  GET /lookup │ rate limit (~30/min/IP)  │
│ foliate-js (EPUB)            │ ───────────▶ │ cache (Cache API, 30 d)  │
│ pdf.js (PDF)                 │              │ providers:               │
│ IndexedDB via idb            │ ◀─────────── │  wiktionary, dictapi,    │
│ (books, progress, history)   │   JSON       │  wikipedia, commons      │
└──────────────────────────────┘              └──────────────────────────┘
```

- **Monorepo** (pnpm workspaces): `apps/web`, `apps/worker`, shared types in `packages/shared`.
- **Worker responsibilities:** proxy to lookup sources, cache results (30 days), rate-limit by IP, and later hold API keys and verify premium entitlements.
- **Hosting:** Cloudflare Pages (web) + Cloudflare Workers (API), free tiers.

## 9. Future (not v1)

- **Premium tier:** accounts, payments (e.g. Stripe), paid providers (e.g. Brave Search images, Merriam-Webster/Oxford dictionaries), possibly flashcards from lookup history.
- AI context-aware lookups, mobile polish, sync, other languages.

## 10. Engineering process

- **Spec-driven:** every feature starts as `docs/features/<feature>.md` with Given/When/Then acceptance criteria. No code without a spec. Significant decisions recorded in `docs/decisions/`.
- **Test-driven:** acceptance criteria become failing tests first (red → green → refactor).
  - Vitest — pure logic (normalisation, lookup chain with mocked fetch, storage).
  - React Testing Library — components (menu, modal).
  - `@cloudflare/vitest-plugin` — Worker.
  - Playwright — end-to-end flows using committed public-domain fixtures (Gutenberg EPUB, text PDF, scanned PDF, fake DRM file).
  - Reader-library integration and visual polish may be test-after, covered by Playwright.
- **Roles:** Claude writes code; the owner reviews and is the only one who merges.
- **PR flow:** one small branch + PR per feature spec, opened via `gh`. PR descriptions link the spec, map criteria → tests, and include a **"Look closely at"** section. Core logic and Worker use **two PRs** (spec + failing tests → implementation); UI and boilerplate use one.
- **CI/CD:** GitHub Actions — typecheck, lint (ESLint + Prettier), tests on every PR; deploy to Cloudflare on merge to `main`.
- **Repo:** public, all rights reserved (no licence). Protected `main` (CI required), secret scanning with push protection, Dependabot, `SECURITY.md`. Secrets live only in Cloudflare/GitHub encrypted secrets; `.dev.vars` is gitignored.
- **Accessibility:** keyboard-operable menu and modal, focus trap, alt text.
