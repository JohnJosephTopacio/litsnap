# Feature: Lookup modal

> Milestone: M2, failed sections M4 · Status: M2 done; MODAL-19/20 in progress · Product spec: [spec.md §4.2–4.5](../spec.md#42-lookup-modal)

## Goal

Choosing **Definition**, **Image** or **Both** in the selection menu ([selection-menu.md](selection-menu.md)) opens a modal over the book. It shows the term, the sentence it came from, the requested content, and a **Search Google ↗** link, without leaving the page.

M2 has no real lookups yet: definitions arrive in M3 and images in M4. So:

- **Production** shows the term, the source sentence, the Google link and _"Definitions and images are coming soon."_ (M2 grilling, Q5). Nobody sees made-up content.
- **`pnpm dev` and component tests** use a mock lookup client, so the definition section, loading, "not found" and error states are built and tested now. M3 swaps in the real Worker client.

The modal's content comes through a `LookupClient` (`apps/web/src/lookup/client.ts`):

```ts
interface LookupClient {
  lookup(term: string, kind: LookupKind, signal: AbortSignal): Promise<LookupResult>;
}
```

`LookupResult` is a **draft** of the M3 Worker response, in `packages/shared/src/lookup.ts`. M3 and M4 may change it. Network errors and rate limits are thrown errors, not part of the result.

## Acceptance criteria

### Opening

**MODAL-1: choosing opens the modal**
Given the selection menu is showing for `hipped roof`
When the reader chooses an item (by click, `Enter`, or `D`/`I`/`B`)
Then the menu closes and a modal opens, centred and smaller than the window, over a dimmed page. The selection stays selected underneath it.

**MODAL-2: header**
Given the modal is open
Then its heading is the display term (lookup-term TERM-9: the book's casing, surrounding punctuation stripped), and under it is the source sentence (TERM-10…17) with the selected words marked (`<mark>`). Both are rendered as text, never as HTML (RD-24).

**MODAL-3: sections for the chosen kind**
Given the reader chose Definition, Image or Both
Then the modal has a Definition section, an Images section, or both (Definition first).

**MODAL-4: Search Google ↗**
Given the modal is open
Then it has a **Search Google ↗** link that opens in a new tab (`target="_blank"`, `rel="noopener noreferrer"`). It searches the lookup term (TERM-1…7), URL-encoded: `https://www.google.com/search?q=<term>` for Definition and Both, and the same with `&udm=2` (Google Images) for Image. The source sentence never goes into the URL.

### Content

**MODAL-5: production, until M3** _(superseded by [lookup-client.md](lookup-client.md), CLIENT-11)_
~~Given the production build, when the modal opens, then instead of sections it shows "Definitions and images are coming soon."~~ Since M3 the production build asks the Worker, and the sections below apply everywhere.

**MODAL-6: loading**
Given a lookup client
When the modal opens
Then each section shows _"Loading…"_ and has `aria-busy="true"` until the result arrives.

**MODAL-7: definition found**
Given the result has a definition
Then the Definition section lists each entry's part of speech with its senses as a numbered list, followed by the attribution line _"From {source}"_, linked to the source page, plus the licence when there is one (spec §4.3). A definition that came from Wikipedia (no dictionary entry) is labelled _"No dictionary entry. Summary from Wikipedia."_ and shows the article's title as a heading with the summary as a paragraph. When the dictionary followed a cross-reference, its note (_"Synonym of hip roof."_) comes before the entries ([definition-providers.md](definition-providers.md), DEF-10).

**MODAL-8: definition not found**
Given the result has no definition
Then the Definition section says _"No definition found."_

**MODAL-9: images, until M4**
Given the result has no images
Then the Images section says _"No good image found."_ (spec §4.4). The image grid, enlarging and attribution are M4.

**MODAL-10: errors and Retry**
Given the lookup fails (network error, rate limit)
Then each requested section says _"Couldn't load this. Try again."_ with a **Retry** button that repeats the lookup. The Google link stays available.

**MODAL-19: a section that failed on its own** _(M4)_
Given the result has a section with `status: 'failed'`: the Worker couldn't look that part up, but did look up the other (lookup-api API-18)
Then that section says _"Couldn't load this. Try again."_ with a **Retry** button, and the other section shows its content as usual. A failure is never shown as _"No definition found."_ or _"No good image found."_: those mean the sources were asked and had nothing.

**MODAL-20: retrying one section** _(M4)_
Given a section that failed on its own (MODAL-19)
When the reader presses its **Retry**
Then only that section shows _"Loading…"_, and the client is asked for that section's kind alone (`definition` or `image`), so the part that worked isn't fetched again. The other section keeps its content. If the retry fails too, by a thrown error or by `failed` again, the section shows MODAL-19's message and Retry again. Closing the modal cancels a retry like any lookup (MODAL-11).

MODAL-10 is unchanged: when the whole lookup failed, every section's Retry repeats the whole lookup.

**MODAL-11: closing cancels**
Given a lookup is still loading
When the modal closes
Then the request is aborted (its `AbortSignal` fires), and nothing is updated after the modal has gone.

### Size

**MODAL-12: S/M/L**
Given the modal is open
Then its corner has **S**, **M** and **L** buttons (named Small, Medium, Large; the current one has `aria-pressed="true"`). They set the width to 28rem, 40rem or 56rem, never more than 92% of the window's width, and at most 85% of its height (the content scrolls inside). The choice is saved and becomes the size for the next lookup, including after a reload. The default is M.

**MODAL-13: size in Settings**
Given the Settings panel is open
Then it has a **Lookup size** choice (Small / Medium / Large) for the same setting.

**MODAL-14: narrow windows**
Given a window narrower than 40rem
Then the modal is the full width of the window, minus a small margin, whatever the size setting.

### Closing

**MODAL-15: Esc, backdrop, Close**
Given the modal is open
When the reader presses `Esc`, clicks the dimmed backdrop, or presses the **Close** button
Then the modal closes. Clicks inside the modal don't close it, and neither does a press that starts inside and ends on the backdrop (selecting text in the modal, say).

**MODAL-16: focus**
Given the modal opens
Then focus moves to its **Close** button. `Tab` moves only between the modal's controls: nothing else on the page can get focus, because the page behind is inert. (As with any modal dialog, `Tab` past the last control may reach the browser's own toolbar before coming back.)

**MODAL-17: after closing**
Given the modal closes
Then the selection is cleared and the keyboard is back in the book: arrow keys turn pages again (M2 grilling, Q12).

**MODAL-18: the reader's keys are off while it's open**
Given the modal is open
When the reader presses arrow keys, `PageUp`/`PageDown` or `D`/`I`/`B`
Then the book doesn't turn and no other lookup starts.

## Design

| Part                        | Where                                                           | Tested by                               |
| --------------------------- | --------------------------------------------------------------- | --------------------------------------- |
| `LookupResult` (draft)      | `packages/shared/src/lookup.ts`                                 | types only                              |
| `googleSearchUrl()`         | `lookup/google.ts`                                              | Vitest                                  |
| `LookupClient`, mock client | `lookup/client.ts`, `lookup/mockClient.ts`                      | Vitest                                  |
| `LookupModal`               | `lookup/LookupModal.tsx`                                        | React Testing Library, against the mock |
| `lookupSize` setting        | `storage/bookStore.ts` ([book-storage](book-storage.md) STO-15) | Vitest                                  |
| Wiring                      | `reader/ReaderScreen.tsx`                                       | Playwright, against what ships          |

- The modal is a native `<dialog>` opened with `showModal()` (M2 grilling, Q9). The browser provides the top layer, the `::backdrop`, `Esc`, and inertness for the rest of the page, which is the focus trap. No dialog library.
- jsdom doesn't implement `showModal()`, so the component tests use a small stand-in from `test-setup.ts`. `Esc`, the backdrop and the focus trap are tested in Playwright, against the real browser.
- The selection menu's temporary flag (selection-menu MENU-15, `lookup/preview.ts`) is removed: from this feature on, lookups are live in production.

## Out of scope

- Real definitions (M3) and images (M4).
- A highlight of our own under the modal (M2 grilling, Q19). The browser's own selection stays, possibly greyed while the modal has focus.
- Lookup history (M6).
