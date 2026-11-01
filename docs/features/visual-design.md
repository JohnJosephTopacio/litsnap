# Feature: Visual design

> Milestone: M4.5 · Status: done · Decision: [0007 Jost](../decisions/0007-jost-typeface.md) · Mockup: [LitSnap UI overhaul mockup](https://claude.ai/artifact/3Uu93Yw2vUjd9jUQqyW98W) (private to the owner)

## Goal

LitSnap is a reader, so its interface should step back: simple, elegant, minimalist. One visual language for every surface, taken from the owner's inspiration image (a Bauhaus-style concept sheet): a warm paper palette with no accent colour, small widely tracked uppercase labels, hairline rules, outline pill controls, a thin progress gauge, and plenty of empty space.

How the reader's controls appear and disappear is [reader-chrome.md](reader-chrome.md). This spec is how everything looks.

Decided in the M4.5 grilling (2026-10-28) and approved on the mockup.

## Tokens

The palette is the inspiration's six greys. `apps/web/src/theme.ts` is the source; `styles.css` repeats the values as custom properties on `:root[data-theme]`, and a unit test fails if they differ (VIS-1).

| Token     | Light               | Dark             | Used for                                                         |
| --------- | ------------------- | ---------------- | ---------------------------------------------------------------- |
| `--paper` | `#F6F4EE`           | `#111111`        | Page and book background, cards, panels                          |
| `--ink`   | `#111111`           | `#E6E1D7`        | Text, book links, filled pills, progress fill, focus ring        |
| `--ink-2` | `#333333`           | `#BEB8AD`        | Secondary text: labels, the title in the top bar, credits, hints |
| `--mark`  | `#777777`           | `#777777`        | Outlines of controls and other non-text marks. **Never text.**   |
| `--rule`  | `#BEB8AD`           | `#333333`        | Hairlines and card borders (decorative)                          |
| `--track` | `#E6E1D7`           | `#333333`        | Progress track, hovered menu items, image placeholders           |
| `--dim`   | `rgb(51 47 40/32%)` | `rgb(0 0 0/55%)` | The lookup modal's backdrop: a warm dim instead of black         |

`#777777` would be the obvious grey for secondary text, but it's about 4.1:1 on `#F6F4EE` and 4.2:1 on `#111111`, under WCAG AA's 4.5:1 for small text. Most of our chrome is small text, so it only draws lines (VIS-2).

## Type

- **Our interface uses Jost** (400 and 500, Latin), a geometric sans in the Futura/Bauhaus tradition, self-hosted from our own origin ([decision 0007](../decisions/0007-jost-typeface.md)).
- **Labels** (`CONTENTS`, `SETTINGS`, `TEXT SIZE`, `DEFINITION`) are 11–13 px, weight 500, tracked 0.2–0.26em, uppercase **through CSS** (`text-transform`), so the DOM text and accessible names keep their normal case (VIS-6).
- **Book text keeps the publisher's fonts** (RD-17). Jost is never injected into the book (VIS-3). Text that comes from the book (title, chapter names, the source sentence) keeps its own case.

## Components

Test-after visual work, checked against the mockup and by screenshots in each PR. Accessible names, roles and keys don't change (VIS-6).

- **Open screen:** **Light · Dark** pills at top right (RD-33). `LITSNAP` large at top left, a tracked subtitle (`READ · HIGHLIGHT · LOOK UP`), the existing tagline, a short hairline, a filled pill **Continue reading** with the last book's title beside it (RD-32, only when there is one), and an outline pill button **Open a book** with the drop hint beside it in `--ink-2`. On the right, `HOW IT WORKS` with three short lines. A hairline and a footer: _"Your book never leaves this browser."_ and `TERMS`. The whole page stays a drop zone (RD-26).
- **Top bar:** `CONTENTS` left; the book's title centred in normal case, `--ink-2`, cut with an ellipsis; `SETTINGS · HOME` right. **HOME** goes back to the start screen (RD-30). No border. A button whose panel is open is underlined.
- **Bottom bar:** the chapter name left in `--ink-2`; on the right a thin progress gauge (about 7rem × 4 px, pill-ended, `--track` with an `--ink` fill) and the percentage in tracked numerals. The gauge is a `progressbar` with its value.
- **Page arrows:** thin chevrons, centred in the left and right gutters ([reader-chrome.md](reader-chrome.md) CHROME-6).
- **Contents:** a full-height sheet from the left, under the top bar, with a hairline edge. Chapters in normal case; the current one is marked by a short `--ink` bar before it (and `aria-current`), not bold.
- **Settings:** a card under its button: hairline border, soft shadow. Each row is a tracked label over **pill segmented controls**. The pressed pill is filled `--ink` with `--paper` text, the others are outlined in `--mark`. Rows: `TEXT SIZE` (A− · % · A+), `THEME`, `LAYOUT`, `LOOKUP SIZE`, `CONTROLS` (CHROME-11).
- **Selection menu:** a small paper card, hairline border, soft shadow. Items are `Definition`, `Image`, `Both` with the key in `--ink-2`; the hovered or focused item gets `--track`.
- **Lookup modal:** a paper card over `--dim`, hairline border. The term large in Jost; S/M/L as small round pills and a thin × close button; the source sentence in the book's serif, italic, `--ink-2`, with the term upright in `--ink`; a short hairline; sections under tracked labels (`DEFINITION`, `IMAGES`); _Retry_ and _Search Google ↗_ as outline pills.
- **Image grid:** square thumbnails ([image-grid.md](image-grid.md) GRID-10) with the credit line under each in `--ink-2`.
- **Image viewer:** the whole image, its full credit in `--ink-2`, Previous/Next as outline pills.
- **Notices** (opening, storage full, errors): text in `--ink`, inside a hairline box.
- **Terms page:** the same type: tracked section labels, Jost for headings and the book serif nowhere.

### Layout

- The reader reserves fixed margins for the chrome: about **4rem** at the top, **3.5rem** at the bottom, and **6rem** gutters on each side (2.5rem when the window is narrower than 600 px). The chrome is drawn over these margins, so the book's area never changes size (CHROME-2).
- Cards have a 6–8 px radius; pills are fully round; hairlines are 1 px.

## Acceptance criteria

**VIS-1: one set of colours**
Given `theme.ts`, `styles.css` and the book's CSS (`bookCss`)
Then all three use the values in the table above, for both themes. A unit test reads `styles.css` and compares its custom properties with `theme.ts`, and `bookCss` takes its colours from `theme.ts`.

**VIS-2: text is readable**
Given either theme
Then every pair of text colour and background our interface uses has a contrast ratio of at least **4.5:1**: `--ink` and `--ink-2` on `--paper`, `--ink` on `--track`, and `--paper` on `--ink` (a pressed pill). Outlines that mark a control (`--mark` on `--paper`) and the progress fill against its track are at least **3:1** (WCAG 1.4.11). A unit test computes the ratios from `theme.ts`.

**VIS-3: Jost, from our own origin, for our interface only**
Given the production build
When the open screen and a book load
Then our interface's text is drawn in Jost, the font files come from our own origin (no request to any other host for a font), and no element inside the book uses Jost.

**VIS-4: the font loads under the production CSP**
Given the production CSP (decision 0002: `font-src 'self' blob: data:`, unchanged)
Then Jost loads with no CSP violation.

**VIS-5: book colours**
Given either theme
Then the book's background is `--paper` and its text `--ink` (RD-17 still forces them). Book links are `--ink` and **underlined**, overriding a publisher's `text-decoration: none`, so they're still told apart from text without colour (WCAG 1.4.1). Images are still never filtered.

**VIS-6: names, roles and keys don't change**
Given the restyled interface
Then every control keeps its accessible name, role and keyboard behaviour (labels are uppercased by CSS only). _Since the start-screen PR: the reader's "Open another book" became **Home** (RD-30), a deliberate change._. The existing unit and end-to-end tests pass without changing how they find elements.

**VIS-7: focus is always visible**
Given a control in our interface has keyboard focus
Then it shows a 2 px `--ink` outline (`:focus-visible`; the selection menu keeps its `:focus` rule, selection-menu.md).

**VIS-8: small windows**
Given a 375 × 667 window
Then the open screen and the reader's chrome fit without horizontal scrolling; a long book title is cut with an ellipsis.

**VIS-9: motion**
Given the restyled interface
Then the only animations are opacity fades of 200 ms or less, and there are none when the system asks for reduced motion (`prefers-reduced-motion: reduce`).

## Design

| Part                          | Where                                      | Tested by                                      |
| ----------------------------- | ------------------------------------------ | ---------------------------------------------- |
| Tokens                        | `apps/web/src/theme.ts`                    | Vitest: VIS-1, VIS-2                           |
| Custom properties, components | `apps/web/src/styles.css`                  | Vitest (VIS-1); Playwright; screenshots in PRs |
| Book colours and links        | `apps/web/src/reader/appearance.ts`        | Vitest (`appearance.test.ts`), Playwright      |
| Jost                          | `@fontsource/jost`, imported in `main.tsx` | Playwright: VIS-3, VIS-4                       |

No pixel-snapshot tests: fonts render differently on this machine and in CI, so they'd be flaky. Each PR carries light and dark screenshots for review instead.

## Out of scope

- How the chrome hides and shows: [reader-chrome.md](reader-chrome.md).
- A sepia or third theme, a reading-font setting, line spacing and margins.
- The library page (M6) and PDF screens (M5): they'll use these tokens.
- The M6 accessibility and polish pass, which audits everything again.
