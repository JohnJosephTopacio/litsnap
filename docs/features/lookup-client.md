# Feature: Lookup client

> Milestone: M3 · Status: done (#31) · Product spec: [spec.md §4.2–4.3, §7](../spec.md#7-privacy--data) · Decision: [0003](../decisions/0003-lookup-api-origin.md)

## Goal

Connect the lookup modal to the Worker, so readers get real definitions. This replaces "Definitions and images are coming soon." (MODAL-5). It also adds a weekly check that the live sources still answer the way our parsers expect.

The modal's sections, loading, error and Retry states are unchanged ([lookup-modal.md](lookup-modal.md)). This feature only supplies the `LookupClient` they use.

## API

| Module                                | Exports                                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `apps/web/config/lookup.ts`           | `LOOKUP_ORIGIN`: the production Worker's origin, used by the CSP too                              |
| `apps/web/src/lookup/workerClient.ts` | `createWorkerLookupClient(baseUrl, options?)`, `lookupBaseUrl(env)`, `LOOKUP_TIMEOUT_MS` (15 000) |
| `apps/web/src/lookup/client.ts`       | `defaultLookupClient`: the Worker client (no longer `undefined`)                                  |
| `.github/workflows/live-check.yml`    | Weekly and on-demand check of the live sources and the deployed Worker                            |

`createWorkerLookupClient(baseUrl, { fetch?, timeoutMs? })` returns a `LookupClient`. `fetch` and `timeoutMs` are only replaced in tests.

## Acceptance criteria

### The client

**CLIENT-1: a lookup**
Given the client is asked for `hipped roof` with kind `both`
When it calls the Worker
Then it sends `GET <baseUrl>/lookup?term=hipped%20roof&kind=both` and resolves with the response's `LookupResult`.

**CLIENT-2: an error status rejects**
Given the Worker answers `400`, `429`, `500` or `502`
Then the lookup rejects, so the modal shows _"Couldn't load this. Try again."_ with Retry (MODAL-10). A `429` isn't treated differently: a reader won't do 30 lookups a minute.

**CLIENT-3: a network error rejects**
Given `fetch` rejects (offline, DNS, CORS)
Then the lookup rejects.

**CLIENT-4: a slow Worker times out**
Given the Worker hasn't answered after `LOOKUP_TIMEOUT_MS` (15 seconds)
Then the request is aborted and the lookup rejects. The Worker's own worst case is about 12 seconds (three providers × 3 s, plus one follow), so this only catches a hung connection.

**CLIENT-5: closing cancels**
Given the caller aborts the signal (MODAL-11: the modal closed)
Then the request is aborted and the lookup rejects with an `AbortError`.

**CLIENT-6: only the term leaves the browser**
Given any lookup
Then the request has only `term` and `kind` in its query string, no body and no custom headers, and is sent with `credentials: 'omit'`. The source sentence, book title and anything else from the book stay in the browser (spec §7, CLAUDE.md hard rules). With no custom headers, it's a CORS simple request, so there's no preflight.

**CLIENT-7: which Worker**
Given `lookupBaseUrl(env)`
Then in a production build it's `LOOKUP_ORIGIN`. In `pnpm dev` it's `VITE_LOOKUP_URL` when set (for example the deployed Worker, if `wrangler dev` can't reach Wikipedia), otherwise `http://localhost:8787`, the address `wrangler dev` uses.

### The policy

**CLIENT-8: the CSP allows exactly the Worker**
Given `CONTENT_SECURITY_POLICY`
Then `connect-src` is `'self' blob: <LOOKUP_ORIGIN>`, and no other directive names a remote host ([decision 0003](../decisions/0003-lookup-api-origin.md)). `script-src` is still `'self'`.

### In the app (Playwright, production build)

The Playwright tests answer requests to `LOOKUP_ORIGIN` with fixed responses (`page.route`), so CI never calls the real Worker. A request the CSP blocked would never reach the route, so these tests also prove the CSP allows it.

**CLIENT-9: definitions appear**
Given a reader selects `hipped roof` and chooses Definition
Then the modal shows the definition the Worker returned, and the Worker was asked for `term=hipped roof&kind=definition`. There are no CSP violations.

**CLIENT-10: errors and Retry**
Given the Worker answers `429` once and then a definition
When the reader chooses Definition and then Retry
Then the modal shows the error with Retry, and then the definition.

**CLIENT-11: coming soon is gone**
Given the production build
When the modal opens
Then it never says _"Definitions and images are coming soon."_ This supersedes MODAL-5.

### Live check

**CLIENT-12: weekly check of the real sources**
Given the `live-check` workflow runs (every Monday, on demand, or on a pull request that changes it or the providers)
Then it runs:

- `pnpm --filter @litsnap/worker test:live`, which asks the **real** Wiktionary, dictionaryapi.dev and Wikipedia for known terms through our providers (`hip roof` found, `hipped roof` followed to _hip roof_, `nikola tesla` from Wikipedia), and the real Wikipedia, Wikidata and Commons for _Hip roof_'s images through the image sources, including that a 330 px thumbnail on `upload.wikimedia.org` answers with `Access-Control-Allow-Origin: *` ([image-providers.md](image-providers.md)).
- A request to the deployed Worker's `/health` and one `/lookup`.

If anything changed, the run fails and GitHub emails the owner.

The live tests go through the providers rather than the deployed `/lookup`, because the Worker caches found definitions for 30 days (API-7). A broken source would hide behind the cache for a month. `test:live` isn't part of `pnpm test` or `pnpm check`, so ordinary CI never touches the network.

## Out of scope

- Images (M4). With kind `image` or `both`, the Worker answers `images: not-found` (API-4), and the modal says _"No good image found."_ (MODAL-9).
- Retrying automatically, and offline caching in the browser beyond the Worker's `Cache-Control` (API-11).
- A different message for rate limits.
