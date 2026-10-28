# Feature: Terms page

> Milestone: M1 · Status: done · Product spec: [spec.md §6](../spec.md#6-reader-features-v1)

## Goal

The reader goes live as soon as M1 merges, so a Terms of Use page has to go live with it. In plain language, it says that LitSnap is provided as-is, that users are responsible for the files they open, and that their data stays in their browser. The Privacy page stays in M6.

> This wording is a plain-language draft, not legal advice. The owner reviews it before merge. A lawyer reviews it before any premium tier, payments or accounts (see [spec.md §9](../spec.md#9-future-not-v1)).

## Page

- A static page at `/terms` (`apps/web/public/terms.html`), so no router is needed. M6 may move it into the app's router.
- No JavaScript. It follows the OS light/dark preference using CSS only.
- It is served under the same CSP as the rest of the site ([decision 0002](../decisions/0002-csp-for-book-content.md)).
- A **"Terms"** link appears in the app footer: on the open screen and in the reader's settings popover. The link opens in a new tab, so the reader isn't interrupted.

## Wording

> **Terms of Use**
>
> _Last updated: {date of merge}_
>
> **1. What LitSnap is.** LitSnap is a free, web-based reader for e-books. Files you open are read inside your browser and are never uploaded to us.
>
> **2. Your files are your responsibility.** Only open files you have the legal right to read. LitSnap doesn't open DRM-protected books and doesn't help remove DRM.
>
> **3. Your data stays on your device.** Your books, reading positions and settings are stored in your browser. If you clear your browser data, they are deleted, and we can't recover them. LitSnap isn't a backup, so keep your own copies of your books.
>
> **4. Lookups and third-party content.** When you look up a word, only that word is sent to LitSnap's server, which asks Wiktionary, the Free Dictionary API and Wikipedia for a definition, and Wikipedia and Wikimedia Commons for images. Your browser then downloads those images directly from Wikimedia, without cookies, so Wikimedia sees your IP address and which images were shown, under the [Wikimedia Foundation's privacy policy](https://foundation.wikimedia.org/wiki/Policy:Privacy_policy).
>
> Definitions and images belong to their authors and are shown under the licences named next to them. LitSnap doesn't check them and can't promise they're accurate or suitable.
>
> **5. Provided "as is".** LitSnap is provided "as is" and "as available", without warranties of any kind. It may contain errors, and it may change or stop at any time.
>
> **6. Limitation of liability.** To the maximum extent permitted by law, the author of LitSnap is not liable for any damages arising from your use of LitSnap, including loss of data.
>
> **7. LitSnap's own code.** LitSnap's source code is public for reading, but all rights are reserved. Using LitSnap doesn't give you a licence to copy or reuse its code or design.
>
> **8. Open-source software.** LitSnap is built with open-source software. Their copyright notices and licences are listed in [Third-party licences](/third-party-licenses.txt).
>
> **9. Changes.** These terms may be updated. The date at the top shows the latest version. Continuing to use LitSnap means you accept the updated terms.
>
> **10. Contact.** Questions? Open an issue on [GitHub](https://github.com/JohnJosephTopacio/litsnap/issues).

Section 4 was planned for M3 ("when lookups ship") but only landed with M4's images (image-grid.md, #38), together with what the browser sends Wikimedia ([decision 0005](../decisions/0005-images-fetched-not-embedded.md)).

## Acceptance criteria

Verified with Playwright against `vite preview`.

**TERMS-1: page renders**
Given the built app
When `/terms` is opened
Then the "Terms of Use" heading, the "Last updated" date and sections 1–10 are visible.

**TERMS-2: same CSP**
Given the built app
When `/terms` is requested
Then the response carries the same `Content-Security-Policy` header as `/`.

**TERMS-3: no scripts**
Given `terms.html`
When its source is checked
Then it contains no `<script>` element and no inline event handlers.

**TERMS-4: reachable from the app**
Given the open screen, or the reader's settings popover
When the user clicks "Terms"
Then `/terms` opens in a new tab.

**TERMS-5: third-party licence notices ship with the site**
Given the built app
When `/third-party-licenses.txt` is requested
Then it lists every package bundled into the web app, plus everything vendored under `apps/web/vendor/`, each with its name, version (or source commit), licence and full licence text. The Terms page links to it (section 7).

**TERMS-6: CI blocks dependencies with disallowed licences**
Given a production dependency of any workspace package (`apps/web`, `apps/worker`, `packages/shared`) whose licence isn't on the allow-list
When CI runs
Then the licence check fails and names the package and its licence.

Allow-list: `MIT`, `ISC`, `BSD-2-Clause`, `BSD-3-Clause`, `Apache-2.0`, `0BSD`, `CC0-1.0`, `Unlicense`. Anything else (GPL, LGPL, AGPL, missing or unknown licence) fails until it's reviewed. An exception is added to the allow-list per package, in a PR that explains why.

## Notes for implementation

- Cloudflare Pages serves `terms.html` at `/terms`, and so does `vite preview` (it tries `<path>.html` before falling back to `index.html`). TERMS-1 runs against `/terms`, not `/terms.html`.
- The CSP (decision 0002) and Playwright arrive in this PR rather than with the reader, because TERMS-2 needs the CSP and TERMS-1/4 need Playwright. Landing the CSP earlier is safe: the rule is only that foliate never lands _without_ it.
- **Why the notices file is needed:** MIT, BSD and Apache licences require their copyright notice and licence text to go along with copies of the code. Serving bundled JavaScript to browsers is distributing a copy, and Vite's minifier strips the licence comments. So we generate the notices file at build time instead, for example with a Rollup licence plugin over the web bundle.
- **Vendored code isn't in `node_modules`,** so no tool will find it automatically. The build step must also read the licence files kept under `apps/web/vendor/` ([decision 0001](../decisions/0001-vendor-foliate-js.md)).
- **The licence check covers production dependencies only.** Dev tools (ESLint, Vitest, …) aren't shipped, so their licences don't bind the app. `pnpm licenses list --prod --recursive --json` gives the data for every workspace package without a new dependency. The check covers the Worker too: it isn't sent to browsers, but AGPL applies even to software that's only accessed over a network.
- The check is a `pnpm check:licenses` script, run in CI next to lint. It is not part of `pnpm check`, so it doesn't slow down the local test loop.
- This is UI with no core logic, so it's one PR. It lands **before** the `epub-reader` PR, linked from the current home page. The `epub-reader` PR keeps the footer link and adds the settings-popover link (TERMS-4).

## Out of scope

- Privacy page (M6).
- Governing law and jurisdiction clause. This depends on the owner's country and is left for legal review before premium.
- Cookie banner (none needed: no cookies, and analytics are cookieless).
