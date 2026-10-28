# Feature: Image providers

> Milestone: M4 · Status: done (#33, #34; production fixes #41–#43) · Product spec: [spec.md §4.4, §5](../spec.md#5-lookup-chain)

## Goal

Inside the Worker, turn a normalised lookup term into **up to 6 freely licensed images**, each with its attribution and alt text. The images come from the Wikipedia article whose title is exactly the term, and if it has fewer than 6, from that article's **Commons category**.

This spec covers only finding the images: pure logic with an injected `fetch`, tested against fixture responses with no network, like [definition-providers.md](definition-providers.md). Putting them into `/lookup` (the cache section, failed sections) is `lookup-api.md`. Showing them in the modal, and the CSP for loading them, are later M4 PRs.

Decided in the M4 grilling (2026-10-27):

- **No free-text Commons search.** Searching Commons for `run` or `gaunt` returns unrelated files, and the spec says never to show an unrelated image. An article's own images and its Commons category are about the article's subject. With no article, the answer is _"No good image found."_
- **Free licences only, always credited.** Non-free ("fair use") files, which English Wikipedia uses for many lead images, are skipped, as are files we can't credit.
- **Image URLs are on `upload.wikimedia.org`.** The browser will download them with `fetch` and show them as `blob:` URLs (decision 0005, in the image-grid PR), and `thumb.wikimedia.org`, where the APIs now point, doesn't send CORS headers. The same paths on `upload.wikimedia.org` do (probed 2026-10-27).

## API

| Module                                      | Exports                                                                                              |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `apps/worker/src/images/types.ts`           | `ImageSource`, `ImageOutcome`, `Article`, `MAX_IMAGES` (6), `THUMB_WIDTH` (330), `FULL_WIDTH` (1280) |
| `apps/worker/src/images/article.ts`         | `findArticle(term, context)`, `ArticleOutcome`                                                       |
| `apps/worker/src/images/files.ts`           | `toLookupImage(page, caption?)`, `FILE_DETAILS`                                                      |
| `apps/worker/src/images/wikipediaImages.ts` | `wikipediaImages`                                                                                    |
| `apps/worker/src/images/commonsImages.ts`   | `commonsImages`                                                                                      |
| `apps/worker/src/images/chain.ts`           | `lookupImages(term, context, sources?)`, `IMAGE_SOURCES`                                             |
| `apps/worker/src/images/wikimedia.ts`       | `CookieJar`, `actionApiJson(url, context)` (IMG-17, IMG-18)                                          |
| `packages/shared/src/lookup.ts`             | `LookupImage` (adds `title` and `mime`)                                                              |

```ts
interface Article {
  title: string; // "Hip roof" for `hipped roof`
  wikidataId?: string; // "Q162034"
}

type ArticleOutcome =
  | { status: 'found'; article: Article }
  | { status: 'not-found' }
  | { status: 'failed'; reason: string };

type ImageOutcome =
  // 1 to MAX_IMAGES. `incomplete`: a source failed before the grid was full (IMG-15).
  | { status: 'found'; images: LookupImage[]; incomplete?: { reason: string } }
  | { status: 'not-found' }
  | { status: 'failed'; reason: string }; // for logs, never shown to readers

interface ImageSource {
  name: 'wikipedia' | 'commons';
  images(article: Article, context: ProviderContext): Promise<ImageOutcome>; // never throws
}

interface LookupImage {
  thumbUrl: string; // 330 px wide (or the original, if narrower)
  fullUrl: string; // 1280 px wide (or the original, if narrower)
  alt: string;
  title: string; // the file's title, for CC 3.0 attribution
  mime: string; // the modal hides image/gif under prefers-reduced-motion
  width: number; // the original's, for the placeholder's aspect ratio
  height: number;
  attribution: Attribution; // author, licence, licenceUrl?, sourceName, sourceUrl
}
```

`ProviderContext` (`fetch`, `timeoutMs`) is the definition providers' (`definitions/types.ts`), with an optional `detailsTimeoutMs` for the slow file-details requests (IMG-3).

### Upstream requests

| Request                | URL                                                                                                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The article            | `https://en.wikipedia.org/api/rest_v1/page/summary/<title>`, as DEF-2                                                                                                      |
| The article's images   | `https://en.wikipedia.org/api/rest_v1/page/media-list/<title>`                                                                                                             |
| File details (article) | `https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&titles=<File:A\|File:B…>&<FILE_DETAILS>`                                                      |
| The Commons category   | `https://www.wikidata.org/w/api.php?action=wbgetclaims&format=json&entity=<Q…>&property=P373`                                                                              |
| The category's files   | `https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2&generator=categorymembers&gcmtitle=<Category:…>&gcmtype=file&gcmlimit=10&<FILE_DETAILS>` |

`FILE_DETAILS` is, in this order:

```
prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=330&iiextmetadatalanguage=en
&iiextmetadatafilter=ObjectName|ImageDescription|Artist|Attribution|LicenseShortName|LicenseUrl|License|NonFree
```

The Action API query strings are built with `URLSearchParams`, so `|` is `%7C`, `:` is `%3A` and a space is `+`.

English Wikipedia's API answers for its own files and for Commons files alike, so one request covers an article's images.

## Acceptance criteria

### Every request

**IMG-1: never throws**
Given `fetch` rejects (a network error) on any request
When `findArticle`, either source or `lookupImages` runs
Then it returns `{ status: 'failed' }` rather than throwing.

**IMG-2: requests identify us**
Given any request in the table above
Then it has `User-Agent: LitSnap/1.0 (https://github.com/JohnJosephTopacio/litsnap)` and `Accept: application/json` (DEF-2), and its URL is exactly as above. Titles go into REST URLs as in DEF-2 (`Hip_roof`, percent-encoded).

**IMG-3: a slow source times out**
Given a request hasn't answered after `timeoutMs`, or a file-details request (the article's or the category's) after `detailsTimeoutMs` (`timeoutMs` if not given)
Then it's aborted and the step returns `failed` (DEF-3). Production gives file details **10 seconds** (`DETAILS_TIMEOUT_MS`) and everything else 3: the first request for a set of files makes Wikimedia generate their licence metadata, which took 0.5–10 seconds for 6–20 files (measured 2026-10-28, #41). Asked again, the same request takes about 50 ms.

**IMG-4: HTTP statuses**
Given `404`, or `400` from a REST endpoint (an invalid title)
Then that step is `not-found`.
Given any other non-2xx status, a body that isn't JSON, JSON that doesn't have the expected shape, or an Action API body with an `error` key (the Action API reports errors with a `200`)
Then that step is `failed`.

### The article

**IMG-5: the exact title, as for definitions**
Given a term
When `findArticle` runs
Then it asks the summary endpoint, which follows redirects (`hipped roof` → _Hip roof_). A `standard` page is found: `{ title: <its title>, wikidataId: <its wikibase_item> }`, leaving `wikidataId` out unless it looks like `Q` followed by digits. Any other `type` (disambiguation, no-extract, main page) is `not-found`, and so are the DEF-5 characters, without a request.

### From file details to an image

`toLookupImage(page, caption?)` turns one entry of an imageinfo response's `query.pages` into a `LookupImage`, or `undefined` if it mustn't be shown. Each entry has `title`, and unless it's `missing`, `imageinfo[0]` with `url`, `thumburl`, `descriptionurl`, `width`, `height`, `mime` and `extmetadata`, whose fields are `{ value: string }`.

**IMG-6: free licences only**
Given a file whose `extmetadata.License` is `pd`, `cc0`, `cc-by-<version>` or `cc-by-sa-<version>`, optionally with a country suffix (`cc-by-sa-3.0-de`), and whose `NonFree` isn't `true`
Then it can be shown. Any other licence (`gfdl` on its own, `fair use`, a missing `License`) or `NonFree: true` means `undefined`.

**IMG-7: always credited**
Given a file
Then its author is the plain text of `Attribution` (the credit line the author asked for) or, if that's missing or empty, of `Artist`. With neither, it's `undefined`. Plain text means DEF-7's rules, after removing `<style>…</style>` and elements hidden with `display: none` (Commons hides a duplicate _"Unknown author"_ that way) together with their content.

**IMG-8: still images that aren't icons**
Given a file whose `mime` isn't `image/jpeg`, `image/png`, `image/gif`, `image/svg+xml` or `image/webp` (e.g. video, audio, PDF, TIFF), or whose shorter side is under 100 pixels (`Video-x-generic.svg` is 48 × 48)
Then it's `undefined`.

**IMG-9: image URLs on `upload.wikimedia.org`**
Given a file
Then `thumbUrl` is its `thumburl` with the host `thumb.wikimedia.org` changed to `upload.wikimedia.org` and the query string (`?utm_source=…`) removed. `fullUrl` is `thumbUrl` with its file name's `330px-` changed to `1280px-` when the file is an SVG or wider than 1280 pixels, and otherwise `url` without its query string. `width`, `height` and `mime` are the original's. If `url` or `thumburl` isn't `https://` on `upload.wikimedia.org` or `thumb.wikimedia.org` under `/wikipedia/`, it's `undefined`: those are the only hosts the browser will be allowed to fetch from.

**IMG-10: attribution**
Given a file
Then `attribution` is `{ author (IMG-7), licence: LicenseShortName, licenceUrl: LicenseUrl (left out if missing), sourceName, sourceUrl: descriptionurl }`. `sourceName` is `Wikimedia Commons` when `descriptionurl` is on `commons.wikimedia.org`, and `Wikipedia` otherwise. A file with no `LicenseShortName` is `undefined`: there would be no licence to name.

**IMG-11: title and alt text**
Given a file
Then `title` is the plain text of `ObjectName`, or the file name without `File:` and its extension. `alt` is the first non-empty of: `caption` (the article's caption, already plain text), the plain text of `ImageDescription`, and `title`. An `alt` over 150 characters is cut at the last space that fits and ends with `…`, 150 characters in all.

### The article's images

**IMG-12: gallery images, in article order**
Given the media-list response's `items`
When `wikipediaImages` runs
Then it takes the items with `type: "image"` and `showInGallery: true`, in their order, and asks for the details of the first 10 (`CANDIDATES`) in one request (titles with `_` as spaces, joined by `|`). It keeps the results in the media-list's order, not the response's, passing each item's `caption.text` to `toLookupImage`. Files that are `missing` or `undefined` are dropped, and the first `MAX_IMAGES` are found. With none, it's `not-found`, without the details request if there were no gallery items.

### The Commons category

**IMG-13: the article's Commons category**
Given the article's `wikidataId`
When `commonsImages` runs
Then it reads the first `P373` (Commons category) claim's string value from Wikidata, and asks Commons for that category's first 10 files, with their details, in one request. It keeps them sorted by title, drops `undefined`s and returns the first `MAX_IMAGES`. Subcategories aren't searched. With no `wikidataId`, it's `not-found` without a request. With no `P373` claim, it's `not-found` without the Commons request. A category without files answers with no `query` key, and that's `not-found` too.

### The chain

**IMG-14: article images first, then the category, at most 6**
Given `lookupImages` finds the article
Then it asks every source in `IMAGE_SOURCES` (`wikipediaImages`, then `commonsImages`) **at the same time**, and returns their images in that order, dropping a file that appears twice (same `sourceUrl`), up to `MAX_IMAGES`. Running the sources in parallel costs a Commons request that the article sometimes makes unnecessary, but keeps a lookup to three rounds of requests (article; media-list and Wikidata; details and category): 3 + 3 + 10 = 16 seconds at worst, inside the client's 20 (CLIENT-4).

**IMG-15: found, not found or failed**
Given the sources' outcomes
Then:

- If the article step is `not-found` or `failed`, so is the result, and no source is asked.
- If a source `failed` before the grid was full (the sources before it gave fewer than `MAX_IMAGES`), the images found so far are still shown: `found`, with `incomplete: { reason }` (the failed source's name and reason). A failure might have hidden images, so `lookup-api.md` caches such a result for 1 day, not 30 (API-20). With no images at all, it's `failed`, as DEF-19.
- A failure after the grid was full doesn't matter: `found`, not `incomplete`.
- Otherwise, with at least one image, it's `found`, and with none, `not-found`.

_Changed in #41:_ an incomplete result used to be `failed`. In production, Wikimedia's Action API answered about half its requests with `503` on 2026-10-28, so a Commons failure blanked images the article had.

**IMG-16: a failure says where it happened** _(#42)_
Given a step fails
Then its `reason` starts with the request that failed: `summary`, `media-list`, `details` (the article's files), `wikidata` or `category` (the category's files), as in `details: HTTP 503`. For an HTTP error, it ends with Wikimedia's `server` and `Retry-After` headers when the response has them (`HTTP 503 (server mw-api-ext.codfw.main-787d, retry-after 15)`), the server cut to 40 characters. `lookupImages` adds the source's name in front (IMG-15), so a log line reads `wikipedia: details: HTTP 503 (…)`. Reasons are only logged, and never contain the term.

Added after production image lookups failed with `wikipedia: HTTP 503` on 2026-10-28, which didn't say which request Wikimedia refused, or which of its servers answered.

**IMG-17: Action API requests are authenticated** _(#43, decision 0006)_
Given `context.wikimediaToken`
Then the three Action API requests (`details`, `wikidata`, `category`) send `Authorization: Bearer <token>`, and the two REST requests (`summary`, `media-list`) don't: Wikimedia serves those from its cache. Without a token (tests, `pnpm dev`, the live check), no request has an `Authorization` header. The token never appears in a reason or a log.

**IMG-18: Wikimedia's cookies are sent back** _(#43, decision 0006)_
Given `context.cookies` (a `CookieJar`)
When an Action API response sets cookies (`Set-Cookie`)
Then their names and values (no attributes) are kept per site: the last two parts of the host, `wikipedia.org`, `wikimedia.org` or `wikidata.org`. Later Action API requests to the same site send them back in one `Cookie` header, with a later value replacing an earlier one of the same name. They're never sent to another site, and at most 20 are kept per site. Wikimedia's CDN identifies clients by cookie as well as by token. These cookies identify LitSnap's Worker, not a reader.

## Notes for implementation

- Fixtures copy the **structure** of real responses (recorded 2026-10-27) with our own wording, so no third-party text is committed.
- `extmetadata` text is HTML from many templates: links, `<bdi>`, `<div class="fn">`, inline `<style>` blocks and hidden duplicates. The output is rendered as text, so stripping only has to look right. It isn't a security boundary.
- Descriptions are asked for in English (`iiextmetadatalanguage=en`), but a file with no English description returns another language. That's accepted: the article's caption (English) comes first.
- Thumbnail widths must be Wikimedia's standard steps (120, 250, 330, 500, 960, 1280, 1920): direct requests for any other width answer `400`. The live check (PR 2) fetches a 330 px `upload.wikimedia.org` thumbnail and checks for `Access-Control-Allow-Origin: *`, so if Wikimedia stops serving thumbnails from that host, we learn within a week.
- `Restrictions` (trademarked, personality rights) isn't used. Showing a logo or a photo of a person to illustrate a word is nominative, non-commercial use.

## Out of scope

- Free-text Commons search, subcategories, and Wikidata's own image (`P18`).
- Images for terms with no article of their own (`gaunt`).
- Images inside a Wiktionary entry.
- Caching, failed sections and the HTTP layer: `lookup-api.md`. Loading, showing and enlarging images: the image-grid and enlarged-view PRs.
