# foliate-js (vendored)

- Source: https://github.com/johnfactotum/foliate-js
- Commit: `78914aef4466eb960965702401634c2cb348e9b1` (2026-05-01)
- Licence: MIT ([LICENSE](LICENSE))
- Why vendored: [decision 0001](../../../../docs/decisions/0001-vendor-foliate-js.md)

## What's here

Only the EPUB code path, copied **unchanged** (byte-identical to the commit above):

`view.js`, `epub.js`, `epubcfi.js`, `progress.js`, `overlayer.js`, `text-walker.js`, `paginator.js`, `fixed-layout.js`, `vendor/zip.js`, `LICENSE`.

## What's left out, and how

`view.js` dynamically imports modules for formats and features LitSnap doesn't use: `pdf.js` (plus about 190 pdf.js files), `mobi.js`, `fb2.js`, `comic-book.js`, `search.js`, `tts.js` and `vendor/fflate.js`. Rather than edit `view.js`, a Vite plugin (`foliateStubs` in `apps/web/vite.config.ts`) resolves those imports to a module that throws. LitSnap only ever passes EPUBs (ZIP files), so `view.js` never reaches those branches.

## Local additions (not from upstream)

- `VENDORED.md`: this file.
- `licenses/zip.js/LICENSE`: BSD-3-Clause text for `vendor/zip.js`, a minified build of `@zip.js/zip.js` 2.8.22 (version from upstream's `package-lock.json`). The minified file carries no notice, so we keep its licence here for `third-party-licenses.txt`.

## Updating

1. Download the new commit into an empty scratch directory.
2. Copy the files listed above, unchanged. Check with `cmp` that each one is identical to upstream.
3. If `view.js` gained new dynamic imports, either add them to `foliateStubs` or vendor them.
4. Check the licences of everything copied, including anything newly bundled under `vendor/` (decision 0001). Update this file's commit line.
5. Run `pnpm test:e2e`. RD-21 (scripts in books never run) must still pass.

**Never** copy code from Foliate, the desktop app. It's GPL-3.0.
