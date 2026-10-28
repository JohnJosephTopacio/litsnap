# Feature: Image viewer

> Milestone: M4 · Status: done (#39) · Product spec: [spec.md §4.4](../spec.md#44-image-content)

## Goal

Clicking a thumbnail in the image grid ([image-grid.md](image-grid.md)) shows that image larger, **inside the modal**, with its full credit. The reader can step through the found images and go back to the grid, by mouse or keyboard.

Decided in the M4 grilling (2026-10-27, Q5) and the legal check: the enlarged view replaces the grid within the Images section, `Esc` goes back to the grid before it closes the modal, and the full credit includes the image's **title**, which CC 3.0 and earlier ask for.

## Design

`ImageGrid` (`apps/web/src/lookup/ImageGrid.tsx`) keeps the downloaded thumbnails and also shows the viewer, so going back to the grid doesn't download anything again. The enlarged image is `fullUrl`, downloaded with the same `loadImage` (GRID-2: Wikimedia only, no cookies, no referrer).

| Part        | Where           | Tested by                                     |
| ----------- | --------------- | --------------------------------------------- |
| The viewer  | `ImageGrid.tsx` | React Testing Library, with a fake loader     |
| `Esc`, keys | the same        | Playwright: the real `<dialog>` and its `Esc` |

## Acceptance criteria

**VIEW-1: thumbnails are buttons**
Given the image grid
Then each thumbnail is a button named _"Enlarge: {alt}"_. It works by click, `Enter` or `Space`.

**VIEW-2: the enlarged view**
Given the reader presses a thumbnail
Then the grid is replaced, inside the Images section, by:

- the image, as large as the modal allows, at its own aspect ratio. Its thumbnail shows at once, and `fullUrl` replaces it when downloaded;
- its `alt` text as a caption under it;
- its position, _"2 of 6"_;
- its full credit: the title, _"by {author}"_, the licence (linked to `licenceUrl` when there is one), and _"View on {sourceName}"_ linked to `sourceUrl`. Links open in a new tab, only `http(s)` URLs become links, and everything is rendered as text (as GRID-5).

The Definition section, with Both, stays where it is.

**VIEW-3: going back**
Given the enlarged view
Then focus is on its **← Back to images** button. Pressing it shows the grid again, with focus on the thumbnail of the image that was showing.

**VIEW-4: stepping through**
Given the enlarged view
When the reader presses **Previous** or **Next**, or `←` or `→`
Then the previous or next image shows, in grid order. Previous is disabled on the first image and Next on the last: no wrapping around. Images the grid left out (GRID-4) are skipped.

**VIEW-5: `Esc` goes back before it closes**
Given the enlarged view
When the reader presses `Esc`
Then the grid shows again and the modal stays open. A second `Esc` closes the modal (MODAL-15).

**VIEW-6: the large image's download**
Given the enlarged view of an image
Then `fullUrl` is downloaded once, with `loadImage`, and shown as a `blob:` URL. If that fails, the thumbnail stays. Images whose `fullUrl` is their `thumbUrl` (small originals) aren't downloaded twice. When the modal closes, those downloads are aborted and their `blob:` URLs revoked, as GRID-7.

**VIEW-7: the book stays put**
Given the enlarged view
When the reader presses `←` or `→`
Then only the image changes: the book doesn't turn (MODAL-18).

## Out of scope

- Zooming or panning inside the enlarged image, and swiping on touch screens (mobile isn't polished in v1, spec §2).
- Opening the original file: the source link leads to its page, which offers it.
