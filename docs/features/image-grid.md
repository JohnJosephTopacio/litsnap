# Feature: Image grid

> Milestone: M4 · Status: in progress · Product spec: [spec.md §4.4, §7](../spec.md#44-image-content) · Decision: [0005](../decisions/0005-images-fetched-not-embedded.md)

## Goal

When a lookup finds images ([image-providers.md](image-providers.md), [lookup-api.md](lookup-api.md) API-17), the modal's Images section shows them as a grid of up to 6 thumbnails, each credited, without letting books load anything new.

Clicking a thumbnail to enlarge it is the next PR (`image-viewer.md`). Until then the thumbnails aren't buttons.

Decided in the M4 grilling (2026-10-27, Q1, Q6, Q9, Q12, Q16) and the legal check:

- **Our code downloads each image and shows it from memory** (`blob:`), rather than pointing `<img>` at Wikimedia. The CSP's `img-src` stays as it is, so books still can't load remote images ([decision 0005](../decisions/0005-images-fetched-not-embedded.md)).
- Downloads send **no referrer and no cookies**. Wikimedia still sees the reader's IP address and which images were requested. Spec §7 and the Terms page say so.

## Design

| Part         | Where                                | Tested by                                       |
| ------------ | ------------------------------------ | ----------------------------------------------- |
| `loadImage`  | `apps/web/src/lookup/imageLoader.ts` | Vitest (node), with a fake `fetch`              |
| `ImageGrid`  | `apps/web/src/lookup/ImageGrid.tsx`  | React Testing Library, with a fake loader       |
| CSP          | `apps/web/config/csp.ts`             | Vitest; Playwright against the production build |
| Grid columns | `apps/web/src/styles.css`            | Playwright                                      |

```ts
/** Downloads one image for the grid (GRID-2). Rejects if it can't be shown. */
function loadImage(url: string, signal: AbortSignal, fetchImpl?: typeof fetch): Promise<Blob>;
```

`ImageGrid` takes `images: LookupImage[]` and an optional `load` (default `loadImage`) for tests. `Images` in `LookupModal.tsx` renders it for a `found` section. `not-found` stays _"No good image found."_ (MODAL-9), and `failed` is MODAL-19.

## Acceptance criteria

**GRID-1: a grid of thumbnails**
Given the result's images are found
Then the Images section shows one thumbnail per image, in the Worker's order, as `<img>` elements with the image's `alt` text (spec §4.4). The grid has 2 columns at size S and 3 at M and L (MODAL-12). The thumbnails aren't buttons yet (`image-viewer.md`).

**GRID-2: our code downloads the images**
Given a thumbnail is shown
Then its `src` is a `blob:` URL made from what `loadImage(thumbUrl)` downloaded, never the Wikimedia URL itself. `loadImage`:

- only fetches URLs starting with `https://upload.wikimedia.org/`, and rejects any other without a request. The CSP would block them anyway (GRID-9); this keeps a bad URL from even trying;
- fetches with `mode: 'cors'`, `credentials: 'omit'` and `referrerPolicy: 'no-referrer'`, so Wikimedia gets neither our cookies (there are none) nor the page the reader is on;
- rejects a non-2xx response, or one whose `Content-Type` isn't `image/…`;
- passes the `AbortSignal` on, so closing the modal stops the download (GRID-7).

**GRID-3: placeholders keep the grid still**
Given a thumbnail is still downloading
Then its place in the grid is already there, with the image's aspect ratio (`width` / `height`), so the grid doesn't jump as images arrive.

**GRID-4: a broken image is left out**
Given a thumbnail's download fails (GRID-2), or the browser can't decode it (`<img>` fires `error`)
Then that thumbnail and its credit are removed from the grid, with no empty box. If none are left, the section says _"No good image found."_ A Commons file can be deleted while our cache still lists it (API-20).

**GRID-5: every thumbnail is credited**
Given a thumbnail is shown
Then under it is one line, `{author} · {licence}`. The author links to the file's page (`sourceUrl`), and the licence links to `licenceUrl` when there is one. Links open in a new tab (`target="_blank"`, `rel="noopener noreferrer"`) and only `http(s)` URLs become links. A long line is cut with an ellipsis, and the line's `title` holds the whole credit, including the image's title (CC 3.0 and earlier ask for it), so nothing is lost until the enlarged view shows it in full. All of it is rendered as text.

**GRID-6: no animation for readers who asked for less motion**
Given the reader's system has `prefers-reduced-motion: reduce`
Then `image/gif` images aren't shown, or even downloaded. If that leaves none, the section says _"No good image found."_

**GRID-7: nothing left behind**
Given the modal closes, or the Images section is replaced (a Retry, MODAL-20)
Then downloads still in progress are aborted, and every `blob:` URL the grid made is revoked (`URL.revokeObjectURL`).

**GRID-8: the other states are unchanged**
Given the result's images are `not-found` (or a found list is empty)
Then the section says _"No good image found."_ (MODAL-9). Given they `failed`, MODAL-19 applies.

**GRID-9: the CSP lets our code fetch images, and only that (decision 0005)**
Given the production build
Then `connect-src` also allows `https://upload.wikimedia.org`, and `img-src` is still `'self' blob: data:`. In Playwright, against the production CSP, the grid shows images from `upload.wikimedia.org` with no CSP violations, and a book that references an image on `upload.wikimedia.org` still can't load it (RD-22).

## Notes for implementation

- jsdom has no `URL.createObjectURL`. The component tests stub it with `vi.spyOn`, and the real `blob:` path is covered by Playwright.
- Playwright fakes `upload.wikimedia.org` with `page.route` (a small PNG, with `Access-Control-Allow-Origin: *`), as `fakeWorker` fakes the Worker. A request the CSP blocks never reaches the route, so seeing it also proves the CSP allows it.
- The weekly live check (CLIENT-12) already checks that real thumbnails send `Access-Control-Allow-Origin: *`.

## Out of scope

- Enlarging, keyboard navigation between images, and the full credit view: `image-viewer.md` (next PR).
- Lazy loading below the fold: 6 small thumbnails load at once.
