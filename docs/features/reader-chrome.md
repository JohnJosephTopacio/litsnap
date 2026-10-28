# Feature: Reader chrome

> Milestone: M4.5 · Status: planned · Product spec: [spec.md §6](../spec.md#6-reader-features-v1) · Looks: [visual-design.md](visual-design.md) · Mockup: [LitSnap UI overhaul mockup](https://claude.ai/artifact/3Uu93Yw2vUjd9jUQqyW98W), board "Reader — auto-hide (press Play)" (private to the owner)

## Goal

While reading, the reader's controls get out of the way: after a few seconds only the book is left. They come back when the reader reaches for them: hovering where they live, clicking blank space, or tabbing to them. Readers who'd rather keep them can turn this off.

Decided in the M4.5 grilling (2026-10-28).

## Terms

- **The chrome:** the top bar, the bottom bar, and the two page arrows. Panels, the selection menu and the lookup modal aren't part of it.
- **Hidden:** fully transparent (`opacity: 0`). Hidden chrome is still in the accessibility tree and still reachable with `Tab` (CHROME-7): no `aria-hidden`, `visibility: hidden` or `inert`.
- **Hot zones:** the reserved top and bottom margins, where the top and bottom bars are drawn.
- **Gutters:** the reserved left and right margins, where the page arrows are drawn.
- **Book area:** everything between the gutters and the hot zones: the book's iframe and the margins foliate draws around the page.
- **Blank space:** any point in the book area that isn't on a character of text, a link, or a form control. That includes foliate's margins, the gap between columns, the space between paragraphs, the empty end of a short chapter, and images.
- **Held:** the chrome is held while any of these is true: a mouse or pen is over a hot zone; keyboard focus (`:focus-visible`) is inside the chrome; the Contents or Settings panel is open.
- **The countdown:** 3 seconds. When it runs out and nothing holds the chrome, it hides.

## Acceptance criteria

All criteria assume the **Controls** setting is **Auto-hide** (the default), except CHROME-11.

### Showing and hiding

**CHROME-1: shown when a book opens, then hidden**
Given a book opens (or the page reloads into one)
Then the chrome is shown, and the countdown starts. When it runs out and the chrome isn't held, the chrome hides.

**CHROME-2: the book never moves**
Given the chrome shows or hides
Then the book's area keeps exactly the same position and size, foliate fires no `relocate`, and the reading position doesn't change. The chrome is drawn over reserved margins, never beside the book.

**CHROME-3: hovering a hot zone**
Given the chrome is hidden
When a mouse or pen moves into the top or bottom hot zone
Then all of the chrome shows, and stays while the pointer is over either hot zone. When the pointer leaves (including leaving the window), the countdown starts again. Moving the pointer over the book area or the gutters doesn't show the chrome.

**CHROME-4: clicking blank space toggles it**
Given a click on blank space in the book area (primary button, the pointer moved less than 5 px between press and release)
Then hidden chrome shows (and the countdown starts), and shown chrome hides at once.

**CHROME-5: clicks that don't toggle**
Given any of these
Then the chrome doesn't change:

- a click on text: the point is inside a character's box. This keeps text free for selecting; a double-click on a word only selects it;
- a click on a link (it's followed, RD-19 and RD-20);
- a press that drags, which selects text;
- a click while text was selected: it only clears the selection (MENU-9);
- the second or later click of a double- or triple-click on blank space;
- a click with another button, or with Ctrl, Alt, Shift or Meta held;
- a click on our own interface: the chrome itself, a panel, the selection menu, the lookup modal.

**CHROME-6: the gutters turn pages while the chrome is hidden**
Given the chrome is hidden or shown
When the reader clicks the left or right gutter
Then it does what the page arrows do (RD-12), and the chrome doesn't change. Hovering a gutter with a mouse or pen fades in that gutter's arrow only; leaving fades it out again (to its resting look, if the chrome is shown).

### Keyboard, panels and lookups

**CHROME-7: the keyboard reaches it**
Given the chrome is hidden
When the reader moves focus into it with `Tab`
Then it shows and is held while keyboard focus stays inside; when focus leaves, the countdown starts. Page-turn keys (RD-12) and the lookup keys (MENU-7) never show it.

**CHROME-8: panels hold it**
Given the Contents or Settings panel is open
Then the chrome is shown. When the panel closes, the countdown starts (unless something else holds it).

**CHROME-9: the selection menu and the lookup modal leave it alone**
Given the selection menu appears, or the lookup modal opens or closes
Then the chrome neither shows nor hides because of it, and a running countdown carries on.

### Settings and devices

**CHROME-10: touch**
Given a touch screen
Then a tap on blank space toggles the chrome as in CHROME-4, and the exceptions in CHROME-5 hold. Touches never count as hovering a hot zone or a gutter. foliate's swipes still turn pages and don't toggle the chrome.

**CHROME-11: Always shown**
Given Settings → **Controls** has **Auto-hide** and **Always shown** (pills with `aria-pressed`, visual-design.md)
When the reader picks **Always shown**
Then the chrome shows and never hides, clicks on blank space do nothing, and the page arrows stay at their resting look. The choice is saved with the other settings and survives a reload. Settings saved before this one existed mean **Auto-hide**.

**CHROME-12: fading**
Given the chrome shows or hides
Then it fades over 200 ms (opacity only, nothing slides). With `prefers-reduced-motion: reduce` it changes at once.

**CHROME-13: every kind of book**
Given a reflowable book in the paginated or the scrolled layout, or a fixed-layout book
Then CHROME-1…12 hold. Scrolling (wheel, keys or touch) never shows the chrome. In a fixed-layout page with no text layer, every point that isn't a link is blank space.

## Design

| Part                       | Where                                              | Tested by                                           |
| -------------------------- | -------------------------------------------------- | --------------------------------------------------- |
| `createChromeVisibility()` | `apps/web/src/reader/chromeVisibility.ts`          | Vitest with fake timers (written first, `it.fails`) |
| `isBlankClick()`           | `apps/web/src/reader/blankClick.ts`                | Vitest (written first, `it.fails`)                  |
| `isOnText()`               | `apps/web/src/reader/blankClick.ts` (DOM geometry) | Playwright, with real layout                        |
| `controls` setting         | `storage/bookStore.ts`, `reader/SettingsPanel.tsx` | Vitest, React Testing Library, Playwright           |
| Wiring                     | `reader/ReaderScreen.tsx`, `reader/ReaderView.tsx` | Playwright (test-after: reader integration)         |

```ts
type HoldReason = 'hover' | 'focus' | 'panel';
type ChromeEvent =
  | { type: 'opened' } // CHROME-1
  | { type: 'hold'; reason: HoldReason }
  | { type: 'release'; reason: HoldReason }
  | { type: 'blankClick' } // CHROME-4
  | { type: 'mode'; mode: 'auto-hide' | 'always' }; // CHROME-11

/** Whether the chrome is shown. Owns the 3 s countdown; calls onChange when visibility flips. */
function createChromeVisibility(
  onChange: (visible: boolean) => void,
  delayMs?: number,
): { readonly visible: boolean; send(event: ChromeEvent): void; dispose(): void };

/** CHROME-4/5: whether a finished press counts as a click on blank space. Pure. */
function isBlankClick(press: {
  button: number;
  modifiers: boolean;
  clickCount: number;
  movedPx: number;
  hadSelection: boolean;
  onText: boolean;
  inLink: boolean;
}): boolean;

/** Whether a point (in the document's own coordinates) is inside a character's box. */
function isOnText(doc: Document, x: number, y: number): boolean;
```

- **The visibility machine knows nothing about the DOM.** `ReaderScreen` turns pointer, focus and panel changes into `hold`/`release` events, so the timing rules (CHROME-1, 3, 7, 8) are unit-tested with fake timers, like the selection watcher.
- **`isOnText`** asks the browser for the caret position under the point (`caretPositionFromPoint`, or `caretRangeFromPoint` where that's all there is), then checks whether the point is inside the box of the character on either side of it. The caret alone isn't enough: on blank space the browser snaps to the nearest text. jsdom has no layout, so this part is only tested in Playwright.
- **Clicks in the book** arrive through `ReaderView`, which already listens to each book document's pointer events. Points there are in the iframe's own coordinates, which is what `isOnText` wants (no offset). Clicks on foliate's margins around the iframe arrive on our page.
- **Nodes from the book are another realm's:** `isOnText` and the link check use `nodeType` and `closest('a[href]')`, never `instanceof` (CLAUDE.md).
- **Hidden chrome stays focusable,** so `Tab` can reveal it (CHROME-7). That's why hiding is opacity only.

## Out of scope

- How the chrome looks: [visual-design.md](visual-design.md).
- A keyboard shortcut to toggle the chrome (grilling: no new key).
- Showing the chrome when the mouse moves anywhere over the book.
- Mobile polish beyond CHROME-10 (spec §2), and a mobile Playwright project.
