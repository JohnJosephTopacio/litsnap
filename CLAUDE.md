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
- `pnpm --filter @litsnap/web <script>` / `pnpm --filter @litsnap/worker <script>` — one package
- `pnpm --filter @litsnap/worker typegen` — regenerate `worker-configuration.d.ts` after changing `wrangler.jsonc` (commit the result)

Tooling notes: Worker tests run inside the Workers runtime via `@cloudflare/vitest-plugin` (not the deprecated `vitest-pool-workers`). TypeScript is pinned to 6.0 until `typescript-eslint` supports 7. Packages with install scripts must be allow-listed under `allowBuilds` in `pnpm-workspace.yaml`.

## How we work

- **Roles:** Claude writes the code; the owner reviews. **Never merge PRs and never push to `main`** — only the owner merges.
- **Spec first:** no feature code without a `docs/features/<feature>.md` containing Given/When/Then acceptance criteria. If behaviour is unclear, ask rather than assume; if the spec is wrong, propose a spec change in the PR.
- **Test first:** write failing tests from the acceptance criteria, then implement (red → green → refactor). Exceptions: reader-library integration and visual polish may be test-after, covered by Playwright.
- **PRs:** one small branch + PR per feature spec, opened with `gh`. Core logic and Worker changes use two PRs: (1) spec + failing tests, (2) implementation. UI and boilerplate use one. Every PR description includes:
  - link to the spec
  - acceptance criteria → tests mapping
  - **Look closely at:** the riskiest or least obvious parts
- **CI must be green** (typecheck, lint, test) before a PR is ready for review.
- **Explain, don't just do:** the owner is building engineering experience — briefly explain non-obvious engineering choices in PR descriptions.

## Hard rules

- Books never leave the browser. The Worker receives only the normalised lookup term.
- No DRM-circumvention code, ever.
- No secrets in the repo. Secrets go in Cloudflare/GitHub encrypted secrets; local ones in `.dev.vars` (gitignored).
- Never show an unrelated image to fill space — show the empty state instead.
- Every displayed image carries its attribution (author, licence, source).
