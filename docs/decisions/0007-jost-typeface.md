# 0007: Jost for our interface, self-hosted, with a reviewed licence exception

- Status: accepted
- Date: 2026-10-28
- Feature: [visual-design.md](../features/visual-design.md)

## Context

The M4.5 overhaul takes its look from a Bauhaus-style inspiration image, and much of that look is the typeface: a geometric sans, widely tracked. Our interface uses `system-ui` today, which is different on every system and can't give that feel.

Three questions:

1. **Which font, if any?** Geometric sans fonts in the Futura tradition are either commercial (Futura itself) or under the **SIL Open Font License 1.1** (Jost, and most open fonts).
2. **Where does it load from?** Google Fonts would be one `<link>`, but every reader's browser would then contact Google, which spec §7 doesn't allow for, and the CSP would need Google's hosts in `style-src` and `font-src`.
3. **Is OFL allowed?** It isn't on our licence allow-list (TERMS-6), which holds software licences only.

## Decision

- **Jost** (weights 400 and 500, Latin subset), from the npm package `@fontsource/jost`. Vite bundles the `.woff2` files into our own assets, so they load from our origin. The CSP already has `font-src 'self' blob: data:` (decision 0002): **no CSP change**.
- **Our interface only.** Jost is never injected into a book; books keep their publisher's fonts (RD-17).
- **A per-package exception, not a new licence on the allow-list.** `apps/web/config/licenses.ts` gets `ALLOWED_PACKAGES['@fontsource/jost']` with the reason. TERMS-6 already says exceptions are added per package, in a reviewed PR.

### Why OFL is acceptable here

The OFL's conditions bind **the font**, not the software that ships it. Its preamble says the fonts "can be bundled, embedded, redistributed and/or sold with any software", as long as the font isn't sold on its own, modified versions keep the OFL and drop the reserved name, and the copyright and licence travel with it. That's nothing like the GPL family, which would reach into our code, and which the hard rules forbid. The Terms page's third-party notices (TERMS-5) already print each production dependency's licence file, so Jost's licence and copyright appear there.

A per-package exception keeps the check strict: a **program** under OFL, or any other font, still fails CI until someone reviews it.

### Alternatives

| Option                    | Why not                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| `system-ui`, styled       | No new dependency, but it doesn't give the inspiration's feel, and differs per system.     |
| Google Fonts              | The reader's IP goes to Google on every visit (spec §7), and the CSP would need loosening. |
| OFL-1.1 on the allow-list | Would let any OFL package in without review.                                               |
| Commit the `.woff2` files | Same licence, but no version, no update path, and the notice has to be kept by hand.       |

## Consequences

- About 20 KB of fonts (two weights, Latin, `woff2`; `@fontsource/jost` 5.3.0), cached after the first visit. We import only the Latin files (`latin-400.css`, `latin-500.css`), so the package's other subsets aren't even bundled; characters outside Latin fall back to the system font. Text renders in the fallback font until Jost arrives (`font-display: swap`).
- `pnpm check:licenses` passes only because of the named exception. A new major version of `@fontsource/jost` is reviewed like any other dependency update.
- Playwright checks that Jost loads under the production CSP and that no font request leaves our origin (VIS-3, VIS-4).
