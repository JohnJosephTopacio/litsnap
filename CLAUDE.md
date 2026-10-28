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
- `pnpm --filter @litsnap/worker test:live` — the definition providers against the **real** Wiktionary, dictionaryapi.dev and Wikipedia (network). Not part of `pnpm check`; the `live-check` workflow runs it weekly and on PRs touching the providers
- `pnpm test:e2e` — Playwright against the built app (`vite preview`, production CSP). CI runs it after `pnpm check`. First time: `pnpm --filter @litsnap/web exec playwright install chromium`
- `pnpm --filter @litsnap/web <script>` / `pnpm --filter @litsnap/worker <script>` — one package
- `pnpm --filter @litsnap/worker typegen` — regenerate `worker-configuration.d.ts` after changing `wrangler.jsonc` (commit the result)

Tooling notes: Worker tests run inside the Workers runtime via `@cloudflare/vitest-plugin` (not the deprecated `vitest-pool-workers`). TypeScript is pinned to 6.0 until `typescript-eslint` supports 7. Packages with install scripts must be allow-listed under `allowBuilds` in `pnpm-workspace.yaml`.

## Codebase notes (learned in M1–M4)

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
- **Lookup flow (M2):** `ReaderView` feeds each book document's `pointerdown`/`pointerup`/`pointercancel`/`selectionchange` and foliate's `relocate` into `createSelectionWatcher` (when), turns a qualifying selection into a `BookSelection` in **our page's** coordinates (the iframe's offset is added), and `ReaderScreen` shows `SelectionMenu` (placed by the pure `placeMenu`) and then `LookupModal`, which gets content from a `LookupClient`: the Worker client (`workerClient.ts`) in dev and production, and a mock only in component tests.
- **Never `instanceof` on book nodes.** Nodes from the book's iframe are another realm's `Text`/`Element`, so `instanceof` is always false: check `nodeType` (this broke `sourceSentence` until #25). Unit tests only catch it with a document from a real second realm: parse with the iframe's own `DOMParser` (see `sourceSentence.test.ts`).
- **foliate moves the book because of selections:** it turns the page when a mouse drag passes the page edge, and scrolls to follow keyboard selections, both firing `relocate`. So the menu hides on `relocate` and comes back after the book settles, if the selection is still on screen (MENU-10). Pressing on already-selected text drags it and fires `pointercancel`, not `pointerup`.
- **Native `<dialog>` (the lookup modal):** jsdom has no `showModal()` (a stand-in lives in `test-setup.ts`), so test `Esc`, the backdrop and inertness in Playwright. A press inside that ends on the backdrop is a click on the `<dialog>`, so close only if the press started there too. `Tab` can leave a modal for the browser's toolbar (`activeElement` = `<body>`); that's normal. Browser styles cap a dialog's `max-width`.
- **Selecting text in e2e tests:** `e2e/selection.ts` (`dragSelect`, `scriptSelect`, `textBoxes`). Code sent into a book frame with `frame.evaluate` must be one self-contained function: the book's CSP blocks `eval`/`new Function`. A drag that starts on selected text drags the text instead, so clear the selection first (`clearSelection`).
- **Worker structure (M3):** `app.ts` → `createApp(deps)`. `index.ts` exports it, plus the `RateLimiter` Durable Object class, which Workers requires from the main module. `/lookup` runs rate limit → validate → cache → definition chain (`definitions/chain.ts`). Providers get `fetch` and `timeoutMs` through `ProviderContext` and never throw: they return `found`, `not-found` or `failed`. A `failed` with nothing found is a 502 and is never cached.
- **Worker tests:** run the app through `test/lookup/support.ts` (`setUp`), which awaits `waitOnExecutionContext`, so `waitUntil` cache writes have finished. `caches.default` and Durable Objects keep their state across tests in a file, so give each test its own term and IP (a reused term once turned a 502 test into a cache hit). Import `env` from `cloudflare:workers`, not `cloudflare:test` (deprecated). Tests get 15 s, because booting the Worker and its Durable Object can take over 5 s under load.
- **Lookups in e2e:** the production build calls the real Worker, so every spec that opens the modal must call `fakeWorker(page)` (`e2e/worker.ts`). A request the CSP blocks never reaches `page.route`, so a faked lookup also proves the CSP allows the Worker.
- **`<dialog>` close timing:** `Esc` hides the dialog at once, but `close` (and so our `onClose`) fires a task later. Poll for anything `onClose` does (MODAL-17 flaked in CI by reading the selection 10 ms after `Esc`).
- **Cloudflare Free plan facts (probed 2026-10-26, decision 0004):** the rate limiting binding deploys but isn't enforced; the Cache API works on `workers.dev`, per data centre; Durable Objects must be SQLite-backed. A probe needs `wrangler login` on this machine. Deploy it under its own name and config, delete it, then `wrangler logout`.
- **Check red tests against a throwaway implementation:** before pushing an `it.fails` PR, write a quick implementation, flip the tests to `it`, run them and mutation-check them, then restore the stubs and keep the draft for the implementation PR. In M3 this caught a broken test before review and found every missing test before the implementation PR.
- **Running mutation checks:** apply each mutation as a literal string replacement, run the relevant tests, restore. E2E mutations rebuild the app each time (~25 s), so run a batch in the background. If a mutation survives, either add the missing test or delete the code it proves useless (M2 removed a resize listener this way).
- **Tool gotchas on this machine:** `curl` can't reach `litsnap.pages.dev` or `en.wikipedia.org` (connection resets), though Playwright's browser and the Workers runtime can. Check the live site with a temporary probe spec using `test.use({ baseURL: 'https://litsnap.pages.dev' })`. Long inline heredocs sometimes fail to parse in the Bash tool: write the script to the scratchpad and run it. The file-writing tools turn `\u00AD`-style escapes into the real (invisible) characters, so write escapes with a script (backslash from `String.fromCharCode(92)`). Git Bash rewrites arguments starting with `/` (`"</p>"`) into Windows paths: prefix the command with `MSYS_NO_PATHCONV=1`.
- **Images (M4):** the Worker's `images/chain.ts` finds the article (`findArticle`), then asks every `ImageSource` at once and merges them. Image URLs must be on `upload.wikimedia.org`: the APIs now return `thumb.wikimedia.org`, which fails CORS `fetch`, so the Worker swaps the host (IMG-9). Wikimedia only serves standard thumbnail widths (120, 250, 330, 500, 960, 1280, 1920); others answer `400`.
- **Never put an image host in `img-src`:** books inherit our CSP. Our code `fetch`es images (`lookup/imageLoader.ts`) and shows `blob:` URLs, and the host goes in `connect-src` (decision 0005). RD-22 tests that books still can't load from it.
- **A section can fail on its own** (`{ status: 'failed' }`, API-18). A 200 with a failed section is `no-store`, or the browser would answer Retry from its cache (API-21). The modal retries that section alone, through a lazy `useLookup` (MODAL-20). When a new status reaches the client, ship the client's handling first (#36 before #37).
- **`Esc` inside the `<dialog>`:** cancelling the `keydown` (`preventDefault`) stops the dialog closing. That's how the image viewer takes the first `Esc` (VIEW-5). Don't fight the `cancel` event, which Chrome limits.
- **Playwright `name` matching is a substring:** `{ name: 'Large' }` also matched _"Enlarge: …"_. Use `exact: true` for short names.
- **Tests that count things break when docs grow:** TERMS-1 counts the Terms' sections. Run the full e2e suite (`pnpm test:e2e`) before pushing any UI or `public/` change, not just the specs you touched.
- **This machine can't reach `upload.wikimedia.org`** either (curl, Node and local `workerd` get resets), like `litsnap.pages.dev`. Playwright's browser can. So the live check's CORS test only runs in CI.
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
