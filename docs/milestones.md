# LitSnap — Milestones (v1)

Each milestone ends with something working and deployed. See [spec.md](spec.md) for the full product spec.

## M0 — Scaffold & pipeline

- pnpm monorepo: `apps/web`, `apps/worker`, `packages/shared`; TypeScript strict, ESLint, Prettier, Vitest.
- "Hello" page on Cloudflare Pages, "hello" Worker on Cloudflare Workers.
- GitHub Actions: typecheck + lint + test on PRs; deploy on merge to `main`.
- Repo hygiene: branch protection, secret scanning + push protection, Dependabot, `SECURITY.md`, `.gitignore` (incl. `.dev.vars`).
- **Owner prerequisites:** install `gh` (`winget install GitHub.cli`) and run `gh auth login`; create a Cloudflare account and an API token for CI.

## M1 — EPUB reader

- Open an EPUB (foliate-js), table of contents, remember position, font size, theme, paginated/scrolled.
- Store books and progress in IndexedDB.
- DRM detection and message.

## M2 — Selection menu & lookup modal (mock data)

- 1–6 word selection → vertical menu (Definition / Image / Both), `D`/`I`/`B` shortcuts.
- Centred modal over dimmed page, S/M/L sizes, `Esc`/click-away, focus trap, source sentence.
- Normalisation logic (TDD).

## M3 — Worker + definitions

- Hono Worker with `/lookup`, provider interface, Wiktionary → dictionaryapi.dev → Wikipedia summary.
- Cache (30 days) and rate limit (~30/min/IP).
- Wire the modal to real definitions.

## M4 — Images

- Wikipedia lead images → Commons search; up to 6 thumbnails, enlarge, attribution, alt text.
- "No good image found" empty state; "Search Google" fallback link.

## M5 — PDF

- pdf.js with text layer, zoom, inverted dark mode.
- Scanned-PDF detection and message.

## M6 — Library, history & polish

- Library page, per-book lookup history.
- Terms and Privacy pages, Cloudflare Web Analytics.
- Accessibility and visual polish pass; README with architecture diagram.
