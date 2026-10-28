# Feature: Lookup API

> Milestone: M3, images M4 · Status: done (M3: #29, #30; images: #35, #37; limits: #44, #45) · Product spec: [spec.md §5, §7, §8](../spec.md#8-architecture) · Decision: [0004](../decisions/0004-lookup-cache-and-rate-limit.md)

## Goal

The Worker's `GET /lookup` endpoint takes a term from the browser and answers with a `LookupResult`. It:

1. Rate-limits each client IP.
2. Re-normalises and checks the term.
3. Answers from the cache when it can.
4. Otherwise runs the definition chain ([definition-providers.md](definition-providers.md)) and the image chain ([image-providers.md](image-providers.md)), at the same time, and caches each section.

It logs what happened without logging what was looked up.

Calling it from the web app (CSP, CORS from the browser's side, the client and its timeout) is `lookup-client.md`.

**M4 (images)** adds API-17…22: the images section, a `failed` status for one section while the other is shown, and an images cache entry. Decided in the M4 grilling (2026-10-27, Q4, Q12): a `502` only when every requested section failed, and failures are still never cached.

## API

```
GET /lookup?term=<selection>&kind=definition|image|both
```

| Status | Body                                          | When                                                        |
| ------ | --------------------------------------------- | ----------------------------------------------------------- |
| `200`  | `LookupResult`                                | At least one requested section was looked up (found or not) |
| `400`  | `{ "error": "invalid-request" }`              | API-3                                                       |
| `429`  | `{ "error": "rate-limited" }` + `Retry-After` | API-12                                                      |
| `502`  | `{ "error": "upstream-failed" }`              | Every requested section `failed` (API-5, API-18)            |

`LookupErrorBody` (in `packages/shared`) is the error body type.

| Module                         | Exports                                                                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/worker/src/app.ts`       | `createApp(deps?)`, `AppDeps`, `LookupLog`, `ALLOWED_ORIGINS`, `MAX_TERM_LENGTH` (100)                                                           |
| `apps/worker/src/cache.ts`     | `definitionCacheKey(term)`, `imagesCacheKey(term)`, `FOUND_TTL_SECONDS`, `NOT_FOUND_TTL_SECONDS`                                                 |
| `apps/worker/src/rateLimit.ts` | `RateLimiter` (Durable Object), `RATE_LIMIT`, `IMAGE_BUDGET`, `RateVerdict`, `checkRateLimit(env, ip)`, `checkImageBudget(env)`, `clientKey(ip)` |
| `apps/worker/src/index.ts`     | `default` (the app), `RateLimiter` (Workers needs the class exported from the main module)                                                       |

`createApp` takes its dependencies so tests can replace them. Production uses the defaults:

```ts
interface AppDeps {
  providers: readonly DefinitionProvider[]; // DEFINITION_PROVIDERS
  images: (term: string, context: ProviderContext) => Promise<ImageOutcome>; // lookupImages
  rateLimit: (env: Env, ip: string) => Promise<RateVerdict>; // checkRateLimit (the Durable Object)
  imageBudget: (env: Env) => Promise<RateVerdict>; // checkImageBudget (one Durable Object for everyone)
  log: (entry: LookupLog) => void; // console.log(JSON.stringify(entry)), read in Workers Logs
}

type RateVerdict = { allowed: true } | { allowed: false; retryAfterSeconds: number };
```

Each section of a `LookupResult` (`packages/shared`) can now also be `{ status: 'failed' }`, with no reason: reasons are for the logs.

```ts
type DefinitionSection =
  ({ status: 'found' } & FoundDefinition) | { status: 'not-found' } | { status: 'failed' };
type ImageSection =
  { status: 'found'; images: LookupImage[] } | { status: 'not-found' } | { status: 'failed' };
```

## Acceptance criteria

### Requests and responses

**API-1: a lookup**
Given `GET /lookup?term=roof&kind=definition`
When the definition chain finds it
Then the response is `200`, `Content-Type: application/json`, with `{ term: 'roof', definition: { status: 'found', ...FoundDefinition } }`.

**API-2: the Worker normalises again**
Given `term=Hipped-Roof,`
Then the chain is asked for `hipped roof` and the result's `term` is `hipped roof`. The Worker doesn't trust the client's normalisation ([lookup-term.md](lookup-term.md)), and the normalised term is the cache key (API-10).

**API-3: invalid requests**
Given `term` is missing, normalises to nothing (`—`), has more than 6 words (`countWords`), or is longer than `MAX_TERM_LENGTH` (100) characters once normalised; or `kind` is missing or not one of `definition`, `image`, `both`
Then the response is `400 { error: 'invalid-request' }` and no provider is asked. The browser's menu never sends these (MENU-1), so they come from scripts or bugs.

**API-4: sections by kind**
Given `kind=definition`, `image` or `both`
Then the result has `definition`, `images`, or both. With `kind=image`, no definition provider is asked, and with `kind=definition`, the image chain isn't (API-17).

**API-5: upstream failure**
Given the definition chain returns `failed` (DEF-19)
Then the response is `502 { error: 'upstream-failed' }`, so the modal shows Retry (MODAL-10). With `kind=both`, that's only when the images failed too (API-18).

**API-6: only `GET /lookup`**
Given `POST /lookup`, or `GET` on an unknown path
Then the response is `404`. `GET /health` still answers as before.

### Cache

**API-7: found definitions are cached for 30 days**
Given a lookup whose definition is found
Then the `definition` section is stored in `caches.default` under `definitionCacheKey(term)` with `Cache-Control: max-age=2592000` (`FOUND_TTL_SECONDS`, 30 days). The next lookup of that term is answered from the cache without asking any provider.

**API-8: not-found definitions are cached for 1 day**
Given a lookup whose definition is `not-found`
Then it's stored with `Cache-Control: max-age=86400` (`NOT_FOUND_TTL_SECONDS`), so a new Wiktionary entry shows up within a day.

**API-9: failures are never cached**
Given the chain `failed`
Then nothing is stored, and the next lookup asks the providers again.

**API-10: the cache key**
Given `term=Hipped-Roof,` after `term=hipped roof` was cached
Then it's a cache hit. The key is `https://lookup-cache.invalid/v1/definition/<encodeURIComponent(term)>`, with `.invalid` so it can never be fetched. `v1` is bumped when parsing changes ([0004](../decisions/0004-lookup-cache-and-rate-limit.md)). `kind` isn't part of the key: `definition` and `both` share the definition entry.

**API-11: browser caching**
Given a `200`
Then it has `Cache-Control: public, max-age=86400`, so the browser doesn't ask again for a day. Errors (`400`, `429`, `502`) have `Cache-Control: no-store`.

### Rate limit

**API-12: 30 requests a minute per IP**
Given 30 requests to `/lookup` from one IP (`CF-Connecting-IP`) within 60 seconds
When a 31st arrives in the same window
Then it's `429 { error: 'rate-limited' }` with `Retry-After` set to the whole seconds left in the window. Requests from other IPs are unaffected. Every request counts, including cache hits and invalid ones, so the check comes first. A request without `CF-Connecting-IP` (only possible locally) counts against the IP `unknown`.

**API-13: the window**
Given the `RateLimiter` for one IP
When `hit(now, limit?)` is called (`limit` is `RATE_LIMIT` unless given: API-24 passes `IMAGE_BUDGET`)
Then the first call starts a 60-second window, and calls 1–30 in the window return `{ allowed: true }`. Later calls in that window return `{ allowed: false, retryAfterSeconds }`, where `retryAfterSeconds` is the rest of the window rounded up (at least 1), and they don't count. The first call at or after the window's end starts a new one.

**API-14: fail open**
Given the rate limit check throws (the Durable Object is unavailable or over its daily cap)
Then the lookup is served as if allowed, and the log says `rateLimit: 'error'`.

**API-23: an IPv6 connection counts as one client** _(#44)_
Given requests from IPv6 addresses in the same `/64` (the first four groups, e.g. `2001:db8:1:2::1` and `2001:db8:1:2:ffff::9`)
Then they share one rate limit (API-12): `rateLimit` is asked for `clientKey(ip)`, `2001:db8:1:2::/64`. A connection is usually given a whole `/64`, so counting each address would let one client rotate addresses past the limit. `clientKey` understands `::` shortening, leading zeros and upper case, and treats an IPv4 address written as IPv6 (`::ffff:203.0.113.7`) as that IPv4 address. IPv4 addresses and `unknown` are their own key. Anything that isn't an IP address counts as `unknown`.

**API-24: a budget for Wikimedia, shared by everyone** _(#44, decision 0006)_
Given an image lookup that isn't in the cache
Then the Worker first asks `imageBudget`: at most `IMAGE_BUDGET`, **50 a minute for all readers together** (one `RateLimiter`, `idFromName('wikimedia')`, with that limit). Each uses at most three Action API requests, so at most 150 of the ~200 a minute Wikimedia gives LitSnap's account. When the budget is spent, the image chain isn't asked: the section is `failed` (API-18, so the reader gets Retry), nothing is cached, and the log has `images: { cache: 'miss', outcome: 'failed', reason: 'budget', ms }`. Cache hits, definitions and `kind=definition` don't use the budget. **Unlike API-14, the budget fails closed:** if it can't be checked (a flood used up the Durable Objects' daily quota, say), the images section is `failed` with reason `budget-error`, and Wikimedia isn't asked. Failing open there would send unlimited requests in LitSnap's name, which is the one way a flood could get its Wikimedia account flagged. One reader, or a few, can't use up LitSnap's Wikimedia account for everyone else, or get it flagged for misbehaving.

### CORS

**API-15: only our pages may read responses**
Given a request with `Origin: https://litsnap.pages.dev`, `http://localhost:5173` (`pnpm dev`) or `http://localhost:4173` (`vite preview`, Playwright)
Then every response, errors included, has `Access-Control-Allow-Origin` set to that origin and `Vary: Origin`.
Given any other `Origin`, or none
Then the response is the same but has no `Access-Control-Allow-Origin`, so another site's scripts can't read it. CORS isn't access control: `curl` still gets an answer. API-12 is what limits scripts.

### Logs

**API-16: one log line per lookup, without the term or the IP**
Given any `/lookup` request
Then `log` is called once with `{ route: 'lookup', status, kind, cache: 'hit' | 'miss' | 'none', rateLimit: 'allowed' | 'denied' | 'error', ms, providers: [{ name, outcome, reason?, ms }] }`:

- `kind` is absent when invalid.
- `cache` is `none` when no definition was needed (invalid, rate-limited, `kind=image`).
- `providers` lists each provider that was asked, in order.

The entry never contains the term, the raw selection or the IP, in any field (spec §7). `reason` comes from DEF-1…4 (`HTTP 500`, `TimeoutError`), never from the term.

### Images (M4)

**API-17: the images section**
Given `kind=image` or `kind=both`
When the image chain (`deps.images`, `lookupImages` in production) returns `found` or `not-found`
Then `images` is `{ status: 'found', images }` or `{ status: 'not-found' }`. The chain is given the normalised term and the same `ProviderContext` as the definition providers (`timeoutMs` 3000), plus `detailsTimeoutMs` 10000 for the slow file-details requests (image-providers IMG-3), `wikimediaToken` from the `WIKIMEDIA_TOKEN` secret when it's set, and the Worker's one `CookieJar` (IMG-17, IMG-18; [decision 0006](../decisions/0006-wikimedia-identity.md)). With `kind=definition`, it isn't asked.

**API-18: one section can fail while the other is shown**
Given `kind=both`
When exactly one of the two chains returns `failed`
Then the response is `200`, with that section `{ status: 'failed' }` and the other as usual, so the modal can show what it has and offer Retry for the rest.
Given `kind=both` with both chains `failed`, or `kind=image` with the image chain `failed`
Then the response is `502 { error: 'upstream-failed' }`, as API-5.

**API-19: both sections are looked up at the same time**
Given `kind=both`, and neither section is cached
Then the definition chain and the image chain run in parallel. The definition chain can take up to four 3-second requests and the image chain 3 + 3 + 10 seconds, so one after the other could pass the client's 20-second limit (CLIENT-4).

**API-20: images are cached like definitions**
Given a lookup whose images are found, not found, or failed
Then the `images` section is stored under `imagesCacheKey(term)` = `https://lookup-cache.invalid/v1/images/<encodeURIComponent(term)>` for 30 days (`FOUND_TTL_SECONDS`) or 1 day (`NOT_FOUND_TTL_SECONDS`), and failures aren't stored (API-7…9). Found images that are `incomplete` (IMG-15: a source failed) are stored for 1 day, like not-found, so the missing ones can arrive tomorrow. The reader gets `{ status: 'found', images }`, without `incomplete`. `image` and `both` share the entry. The definition and images entries are independent: with `kind=both`, a term whose definition is cached but whose images aren't asks only the image chain.

**API-21: a partial answer isn't kept by the browser**
Given a `200` with a `failed` section
Then it has `Cache-Control: no-store`, not API-11's day. Otherwise the browser would answer the reader's Retry with the same failure from its own cache.

**API-22: logs say how the images went, without the term**
Given a lookup with `kind=image` or `kind=both`
Then the log entry (API-16) also has `images: { cache: 'hit' | 'miss', outcome: 'found' | 'not-found' | 'failed', reason?, ms }`. `outcome` is the section's status (from the cache, on a hit), `reason` is the image chain's (`commons: HTTP 503`) when it failed or its result is `incomplete`, and `ms` is how long the section took. Without images (`kind=definition`, invalid or rate-limited requests), the entry has no `images` key. API-16's rule holds: no term, selection or IP in any field.

**Cloudflare's own request logs** _(#42)_
The Worker's config turns off Cloudflare's invocation logs (`observability.logs.invocation_logs: false`). Those record, for every request, the reader's IP address, city, postcode, coordinates, browser and the full URL, term included (seen 2026-10-28). API-16's line is what's left. Cloudflare still attaches the request URL, and with it the term, to that line, and Workers Logs keep it for 3 days on the Free plan. **Decided (#46): accepted and disclosed** in spec §7 and the Terms (section 4). The logs are only visible to the owner, and they're what found the image failures (#42). Turning Workers Logs off would lose that, and taking the term out of the URL would cost browser caching (API-11) and add a CORS preflight. If a premium tier or accounts arrive (spec §9), revisit it with the legal review.

## Notes for implementation

- Test with `createApp(deps).fetch(request, env, ctx)` from `cloudflare:test`, so fake providers and a fake `log` can be passed in. Use `waitOnExecutionContext(ctx)` before reading the cache, because the cache is written with `ctx.waitUntil`. Use a different IP from `203.0.113.0/24` (a documentation range) in each rate-limit test, and a different term in each cache test.
- The Durable Object is addressed with `env.RATE_LIMITER.idFromName(ip)`, and `hit` is called over RPC. `Date.now()` is passed in from the Worker, which keeps `hit` deterministic in tests.
- `wrangler.jsonc` gets the `RATE_LIMITER` binding and a `new_sqlite_classes` migration, because Free only allows SQLite-backed Durable Objects, even unused storage. Run `pnpm --filter @litsnap/worker typegen` afterwards.

## Out of scope

- The web client, CSP, timeout and the live check (`lookup-client.md`). Showing a failed section and retrying it alone is the modal's job (`lookup-modal.md`, M4).
- Per-user limits, API keys, and premium entitlements (spec §9).
