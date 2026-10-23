# 0001: Vendor foliate-js at a pinned commit

- Status: accepted
- Date: 2026-10-23
- Feature: [epub-reader.md](../features/epub-reader.md)

## Context

LitSnap renders EPUBs with [foliate-js](https://github.com/johnfactotum/foliate-js) (MIT). It isn't published to npm, so we have to choose how to bring it into `apps/web`:

1. **pnpm git dependency** pinned to a commit SHA (`github:johnfactotum/foliate-js#<sha>`).
2. **Vendor** (copy) the source into the repo at a pinned commit.
3. **git submodule**.

## Decision

Vendor it into `apps/web/vendor/foliate-js/`, copied from commit
[`78914aef4466eb960965702401634c2cb348e9b1`](https://github.com/johnfactotum/foliate-js/commit/78914aef4466eb960965702401634c2cb348e9b1)
(2026-05-01), with its `LICENSE` file kept alongside. The directory gets a short `VENDORED.md` recording the source commit and any local changes (ideally none).

**Only the EPUB code path is vendored**, byte-identical to upstream. `view.js` also dynamically imports modules for formats we don't support (PDF, MOBI, FB2, comics) and features we don't use (TTS, search). A Vite plugin (`foliateStubs`) resolves those imports to a module that throws, so we don't edit `view.js` and don't ship pdf.js (about 12 MB). We only ever pass EPUBs, which never reach those branches. `VENDORED.md` lists the exact files.

## Why

- **What we review is what we run.** foliate-js renders untrusted book content, and the source code is part of our security surface ([0002](0002-csp-for-book-content.md)). A vendored copy shows up in diffs and code review. A git dependency is hidden in `node_modules`.
- **No install-time network dependency on GitHub**, and nothing to add to pnpm's `allowBuilds`.
- **Submodules** add friction (`--recursive` clones, CI checkout settings) for no benefit at this size.
- foliate-js is plain ES modules, so Vite bundles it directly without a build step.

## Consequences

- Dependabot won't tell us about foliate-js updates. We update by hand: copy a newer commit and update `VENDORED.md` in its own PR.
- `apps/web/vendor/` is excluded from ESLint and Prettier (third-party code keeps upstream formatting), but stays in TypeScript's `allowJs` scope as needed.
- foliate-js bundles its own third-party code (zip.js: BSD-3-Clause, fflate: MIT, PDF.js: Apache-2.0). Their licence notices stay with the vendored files. We won't use foliate's PDF support; PDF arrives in M5 via pdf.js directly.
- The CI licence check ([terms-page.md](../features/terms-page.md), TERMS-6) reads `node_modules`, so it **can't see vendored code**. Whoever updates the vendored copy checks the licences of everything in it by hand, lists them in `VENDORED.md`, and makes sure they appear in `third-party-licenses.txt` (TERMS-5).
- **Never copy code from Foliate, the desktop e-reader app by the same author.** It is GPL-3.0, and GPL code would oblige us to release LitSnap's code. Only the separate _foliate-js_ library is MIT.
