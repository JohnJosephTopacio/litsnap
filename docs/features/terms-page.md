# Feature: Terms page

> Milestone: M1 · Status: proposed · Product spec: [spec.md §6](../spec.md#6-reader-features-v1)

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
> **4. Provided "as is".** LitSnap is provided "as is" and "as available", without warranties of any kind. It may contain errors, and it may change or stop at any time.
>
> **5. Limitation of liability.** To the maximum extent permitted by law, the author of LitSnap is not liable for any damages arising from your use of LitSnap, including loss of data.
>
> **6. LitSnap's own code.** LitSnap's source code is public for reading, but all rights are reserved. Using LitSnap doesn't give you a licence to copy or reuse its code or design.
>
> **7. Changes.** These terms may be updated. The date at the top shows the latest version. Continuing to use LitSnap means you accept the updated terms.
>
> **8. Contact.** Questions? Open an issue on [GitHub](https://github.com/JohnJosephTopacio/litsnap/issues).

When lookups ship (M3), a **"Lookups"** section is added: the looked-up term is sent to LitSnap's server, and results come from third-party sources (Wiktionary, Wikipedia, Wikimedia Commons) under their own licences, with no guarantee of accuracy.

## Acceptance criteria

Verified with Playwright against `vite preview`.

**TERMS-1: page renders**
Given the built app
When `/terms` is opened
Then the "Terms of Use" heading, the "Last updated" date and sections 1–8 are visible.

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

## Notes for implementation

- Cloudflare Pages serves `terms.html` at `/terms`. `vite preview` serves single-page apps with a fallback to `index.html`, so the preview server must map `/terms` the same way, and TERMS-1 runs against `/terms`, not `/terms.html`.
- This is UI with no core logic, so it's one PR. It lands **before** the `epub-reader` PR, linked from the current home page. The `epub-reader` PR keeps the footer link and adds the settings-popover link (TERMS-4).

## Out of scope

- Privacy page (M6).
- Governing law and jurisdiction clause. This depends on the owner's country and is left for legal review before premium.
- Cookie banner (none needed: no cookies, and analytics are cookieless).
