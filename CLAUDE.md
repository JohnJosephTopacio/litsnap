# LitSnap

Web reader for EPUB/PDF: highlight a word or phrase → definition and/or images in an overlay, without leaving the book.

- Product spec: [docs/spec.md](docs/spec.md) — source of truth for behaviour.
- Milestones: [docs/milestones.md](docs/milestones.md)
- Feature specs: `docs/features/<feature>.md` · Decisions: `docs/decisions/`

## Stack

pnpm monorepo — `apps/web` (React + Vite + TypeScript, foliate-js, pdf.js, IndexedDB via `idb`), `apps/worker` (Cloudflare Worker, Hono), `packages/shared` (shared types). Hosted on Cloudflare Pages + Workers.

## Commands

Run from the repo root:

- `pnpm install` — install everything
- `pnpm dev` — web (Vite) and worker (`wrangler dev`) in parallel
- `pnpm check` — what CI runs: format check, lint, typecheck, tests. Run before every push.
- `pnpm test` / `pnpm typecheck` / `pnpm lint` / `pnpm format` — individually
- `pnpm check:licenses` — fails if a production dependency's licence isn't allowed (CI runs it; allow-list in `apps/web/config/licenses.ts`)
- `pnpm test:e2e` — Playwright against the built app (`vite preview`, production CSP). CI runs it after `pnpm check`. First time: `pnpm --filter @litsnap/web exec playwright install chromium`
- `pnpm --filter @litsnap/web <script>` / `pnpm --filter @litsnap/worker <script>` — one package
- `pnpm --filter @litsnap/worker typegen` — regenerate `worker-configuration.d.ts` after changing `wrangler.jsonc` (commit the result)

Tooling notes: Worker tests run inside the Workers runtime via `@cloudflare/vitest-plugin` (not the deprecated `vitest-pool-workers`). TypeScript is pinned to 6.0 until `typescript-eslint` supports 7. Packages with install scripts must be allow-listed under `allowBuilds` in `pnpm-workspace.yaml`.

## Codebase notes (learned in M1)

The README has the repository layout. Things that aren't obvious from reading the code:

- **Reader structure:** `App` (startup, open screen, saving) → `ReaderScreen` (chrome, panels, keys, progress saver) → `ReaderView` (the only code that touches foliate). `ReaderView`'s open effect depends only on `[file, call]`; callbacks are read via `useEffectEvent`, so parent re-renders never reopen the book.
- **All navigation goes through `ReaderView`'s queue,** including in-book links (foliate's `link` event is cancelled and re-queued). foliate's paginator silently drops `next`/`prev`/`goTo` while a page turn is settling (`#locked`), and the queue only starts once the book is positioned.
- **Two foliate renderers:** reflowable books use the paginator (`setStyles`, `flow`); fixed-layout books (`view.isFixedLayout`) use `foliate-fxl`, which has neither. Anything that styles or lays out the book must handle both (#18).
- **Book CSS** lives in `reader/appearance.ts` (`bookCss`): font size on the root, forced theme colours on `body *`, and `body { position: static }` (RD-29). foliate's own resets are in `vendor/foliate-js/paginator.js` (`columnize`/`scrolled`).
- **Book documents are in `blob:` iframes inside closed shadow roots.** Tests reach them with `page.frames()` (`e2e/book.ts` → `bookFrame`). Objects from inside the iframe (e.g. a dropped `File`) belong to another JavaScript realm: re-wrap them before handing them to our code or zip.js.
- **e2e helpers:** `e2e/storage.ts` reads and writes IndexedDB directly. After changing a setting, wait for `storedSetting(...)` before `page.reload()`, because settings save in the background. Test books are generated in `e2e/fixtures.ts`. Never commit a real book you can't redistribute; copy just the triggering markup into a generated fixture.
- **Prove tests can fail.** For each new test, break the behaviour on purpose (a "mutation check") and confirm the test fails, then restore. A test that passes on broken code was the cause of several near-misses in M1. Mention mutation checks in the PR.
- **CI is slower than local** and exposes timing races. When a Playwright test fails in CI, download its report (`gh run download <run> -n playwright-report`) and read the trace and error context before guessing.
- **Unit tests that use IndexedDB or `Blob` contents** run with `// @vitest-environment node`: fake-indexeddb turns jsdom's `Blob` into a plain object. DOM-free tests use node too.
- **Temporary probe specs** (`e2e/probe-*.spec.ts`) are for local diagnosis only: delete them and never commit them. Check that `apps/web/undefined/` doesn't exist before committing (screenshots from a probe run without `SHOT_DIR`).
- **Issue references in commits:** GitHub closes an issue when a merged commit says e.g. `fix: … #17`. If the issue must stay open, keep its number out of `fix:` commit messages and write "Part of #N" only in the PR body.

## How we work

- **Roles:** Claude writes the code; the owner reviews. **Never merge PRs and never push to `main`** — only the owner merges.
- **Spec first:** no feature code without a `docs/features/<feature>.md` containing Given/When/Then acceptance criteria. Each criterion has an ID (`DRM-1`, `STO-3`, `RD-21`), and tests are named after the IDs they cover. If behaviour is unclear, ask rather than assume; if the spec is wrong, propose a spec change in the PR.
- **Decisions:** significant choices go in `docs/decisions/NNNN-short-title.md` (context, decision, why, consequences).
- **Test first:** write failing tests from the acceptance criteria, then implement (red → green → refactor). Exceptions: reader-library integration and visual polish may be test-after, covered by Playwright.
- **Red phase with green CI:** in a failing-tests PR, write each acceptance test as Vitest `it.fails` against a stub, so required CI still passes. The implementation PR changes only `it.fails` → `it` in those tests, which shows they weren't weakened. Test helpers and fixtures get ordinary passing tests, so red tests can't fail for the wrong reason.
- **PRs:** one small branch + PR per feature spec, opened with `gh`. Core logic and Worker changes use two PRs: (1) spec + failing tests, (2) implementation. UI and boilerplate use one. Every PR description includes:
  - link to the spec
  - acceptance criteria → tests mapping
  - **Look closely at:** the riskiest or least obvious parts
- **Commits:** a few logical commits per branch (e.g. `docs:` → `test:` → `feat:`). Each round of review fixes is its own `fix: address review — …` commit. Never amend or force-push a branch under review. The owner squash-merges, so `main` gets one commit per PR. Aim for < ~400 changed lines per PR.
- **Before pushing to an existing PR branch,** check that the PR is still open (`gh pr view <n> --json state`). If it was merged, branch again from the latest `main` and open a new PR.
- **CI must be green** (typecheck, lint, test) before a PR is ready for review.
- **Explain, don't just do:** the owner is building engineering experience — briefly explain non-obvious engineering choices in PR descriptions.

## Hard rules

- Books never leave the browser. The Worker receives only the normalised lookup term.
- No DRM-circumvention code, ever.
- Only permissively licensed production dependencies (the allow-list in [terms-page.md](docs/features/terms-page.md), TERMS-6). No GPL/LGPL/AGPL. Never copy code from the Foliate desktop app (GPL-3.0); only the foliate-js library is MIT. The repo is "all rights reserved", so copyleft code can't go in it.
- Book content is untrusted. foliate-js (or any book rendering) never lands without the CSP and its "scripts in books never run" test (RD-21). Loosening the CSP, especially `script-src`, needs a new decision record. See [decision 0002](docs/decisions/0002-csp-for-book-content.md).
- Text from a book (title, author, TOC, selections) is rendered as text, never as HTML: no `dangerouslySetInnerHTML`, `innerHTML` or similar.
- No secrets in the repo. Secrets go in Cloudflare/GitHub encrypted secrets; local ones in `.dev.vars` (gitignored).
- Never show an unrelated image to fill space — show the empty state instead.
- Every displayed image carries its attribution (author, licence, source).
