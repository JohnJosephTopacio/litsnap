# Feature: Selection menu

> Milestone: M2 · Status: done · Product spec: [spec.md §4.1](../spec.md#41-selection--menu)

## Goal

When the reader selects 1–6 words in a book, a small vertical menu appears next to the selection: **Definition**, **Image**, **Both**. Choosing one opens the lookup modal ([lookup-modal.md](lookup-modal.md)). This spec covers when the menu appears, where it goes, how it's used from the keyboard, and when it goes away.

Word counting uses `countWords(normalise(text))` from [lookup-term.md](lookup-term.md) (TERM-8).

## Acceptance criteria

### Appearing

**MENU-1: a mouse selection of 1–6 words**
Given a reflowable book
When the reader drags over 1–6 words and releases the mouse
Then a menu with **Definition**, **Image** and **Both** appears beside the selection. It doesn't appear while the mouse button is still down.

**MENU-2: other selections show no menu**
Given a selection of 0 words (punctuation only, or nothing), or of 7 or more words
When the mouse is released
Then no menu appears. If a selection with a menu is changed to one with 7 or more words, the menu disappears.

**MENU-3: selections made without the mouse**
Given a selection made with the keyboard, by touch, or by script
When the selection stops changing for 300 ms
Then the menu appears (if MENU-2 allows it). While it's still changing, there's no menu.

**MENU-12: only selections in the book**
Given text selected in our own interface (the top bar, the table of contents, the settings panel)
Then no menu appears.

**MENU-13: fixed-layout books**
Given a fixed-layout book
When text is selected
Then no menu appears. Lookups for fixed-layout books come with [#19](https://github.com/JohnJosephTopacio/litsnap/issues/19).

### Placement

The **reader area** is the region the book is drawn in (between the page arrows, under the top bar). Placement is a pure function, `placeMenu()`, in `apps/web/src/lookup/placeMenu.ts`.

**MENU-4: beside the end of the selection**
Given a selection whose last line has room to its right
Then the menu's left edge is 8 px to the right of where the selection ends, and its top is level with the top of that line.

**MENU-5: flipped to the left near the right edge**
Given there isn't room to the right (the menu would come closer than 8 px to the reader area's right edge)
Then the menu goes to the left of where the selection **starts**: its right edge is 8 px left of the selection's start, and its top is level with the selection's first line.

**MENU-6: kept inside the reader area**
Given the menu would come closer than 8 px to the reader area's bottom (or top) edge
Then it moves up (or down) until it's 8 px inside. If neither side of the selection has room (a selection spanning the whole width), the menu goes 8 px below the selection's last line, or 8 px above its first line if there's no room below. It is never placed over the selected text.

**MENU-14: both layouts**
Given the paginated or the scrolled layout
Then MENU-4…6 hold.

### Choosing

**MENU-7: shortcuts**
Given the menu is visible
When the reader presses `D`, `I` or `B` (either case, no Ctrl/Alt/Meta)
Then Definition, Image or Both is chosen: the menu closes and the lookup modal opens (lookup-modal MODAL-1). While no menu is visible, these keys do nothing.

**MENU-11: keyboard and screen readers**
Given the menu has appeared
Then it doesn't take focus: keys still reach the book. Pressing `Tab` moves focus to **Definition**. Inside the menu, `↓`/`↑` move between items (wrapping round), `Home`/`End` go to the first and last, and `Enter` or `Space` chooses. The menu is a `role="menu"` labelled "Look up", and each item is a `menuitem` with `aria-keyshortcuts` (`D`, `I`, `B`).

### Going away

**MENU-8: Escape**
Given the menu is visible (with focus in the book or in the menu)
When the reader presses `Esc`
Then the menu closes and the selection stays. If the focus was in the menu, it goes back to the book, so arrow keys turn pages again. If a panel is open, a second `Esc` closes it (RD-14).

**MENU-9: clicking elsewhere**
Given the menu is visible
When the reader clicks elsewhere in the book (which clears the selection)
Then the menu closes. When the reader clicks our own interface (the top bar, a panel, a page arrow), the menu closes too, but the selection stays. Opening a panel doesn't close one that's already open, or the other way round (M2 grilling, Q27).

**MENU-10: page turns, scrolling and resizing**
Given the menu is visible
When the book moves (a page turn, a scroll, or foliate keeping a selection in view)
Then the menu closes. 300 ms after the book stops moving, it comes back beside the selection, but only if the selection is still entirely inside the reader area. After a real page turn the selection is off screen, so the menu stays closed. Resizing the window counts as the book moving: the menu closes, and comes back beside the selection once the book has been laid out again.

## Design

| Part                       | Where                                              | Tested by                                   |
| -------------------------- | -------------------------------------------------- | ------------------------------------------- |
| `placeMenu()`              | `lookup/placeMenu.ts`                              | Vitest (written first)                      |
| `createSelectionWatcher()` | `lookup/selectionWatcher.ts`                       | Vitest with fake timers (written first)     |
| `SelectionMenu`            | `lookup/SelectionMenu.tsx`                         | React Testing Library                       |
| Wiring                     | `reader/ReaderView.tsx`, `reader/ReaderScreen.tsx` | Playwright (test-after: reader integration) |

- **The watcher** decides _when_ to look at the selection. It gets `pointerdown`, `pointerup` and `selectionchange` from each book document, plus foliate's `relocate`. It knows nothing about the DOM: it asks for a key that identifies the current selection, so a `selectionchange` that arrives after `pointerup` for the same selection is ignored instead of making the menu flicker.
- **`ReaderView`** turns a selection into what the menu needs: the text, the `Range`, and the rectangles of its first and last lines in **our** page's coordinates (the selection's rectangles are relative to the book's iframe, so the iframe's position is added).
- **`ReaderScreen`** owns the menu: keys (the book's iframe already forwards its key presses) and click-away.

## Out of scope

- The lookup modal: `lookup-modal.md`.
- Touch polish: the menu appears on touch (MENU-3), but there's no special handling for the phone's own selection menu.
- Shift + arrow keys still turn pages (RD-12) rather than extend the selection.
- Fixed-layout books (#19).
