# Feature: Lookup API

> Milestone: M3 · Status: spec + failing tests · Product spec: [spec.md §5, §7, §8](../spec.md#8-architecture) · Decision: [0004](../decisions/0004-lookup-cache-and-rate-limit.md)

## Goal

The Worker's `GET /lookup` endpoint takes a term from the browser and answers with a `LookupResult`. It:

1. Rate-limits each client IP.
2. Re-normalises and checks the term.
3. Answers from the cache when it can.
4. Otherwise runs the definition chain ([definition-providers.md](definition-providers.md)) and caches the result.

It logs what happened without logging what was looked up.

Calling it from the web app (CSP, CORS from the browser's side, the client and its timeout) is `lookup-client.md`. Images stay "not found" until M4.

## API

```
GET /lookup?term=<selection>&kind=definition|image|both
```

| Status | Body                                          | When                                  |
| ------ | --------------------------------------------- | ------------------------------------- |
| `200`  | `LookupResult`                                | Looked up (found or not)              |
| `400`  | `{ "error": "invalid-request" }`              | API-3                                 |
| `429`  | `{ "error": "rate-limited" }` + `Retry-After` | API-12                                |
| `502`  | `{ "error": "upstream-failed" }`              | The definition chain `failed` (API-5) |

`LookupErrorBody` (in `packages/shared`) is the error body type.

| Module                         | Exports                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------ |
| `apps/worker/src/app.ts`       | `createApp(deps?)`, `AppDeps`, `LookupLog`, `ALLOWED_ORIGINS`, `MAX_TERM_LENGTH` (100)     |
| `apps/worker/src/cache.ts`     | `definitionCacheKey(term)`, `FOUND_TTL_SECONDS`, `NOT_FOUND_TTL_SECONDS`                   |
| `apps/worker/src/rateLimit.ts` | `RateLimiter` (Durable Object), `RATE_LIMIT`, `RateVerdict`, `checkRateLimit(env, ip)`     |
| `apps/worker/src/index.ts`     | `default` (the app), `RateLimiter` (Workers needs the class exported from the main module) |

`createApp` takes its dependencies so tests can replace them. Production uses the defaults:

```ts
interface AppDeps {
  providers: readonly DefinitionProvider[]; // DEFINITION_PROVIDERS
  rateLimit: (env: Env, ip: string) => Promise<RateVerdict>; // checkRateLimit (the Durable Object)
  log: (entry: LookupLog) => void; // console.log(JSON.stringify(entry)), read in Workers Logs
}

type RateVerdict = { allowed: true } | { allowed: false; retryAfterSeconds: number };
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
Then the result has `definition`, `images`, or both. `images` is `{ status: 'not-found' }` until M4 (MODAL-9). With `kind=image`, no definition provider is asked.

**API-5: upstream failure**
Given the definition chain returns `failed` (DEF-19)
Then the response is `502 { error: 'upstream-failed' }`, so the modal shows Retry (MODAL-10).

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
When `hit(now)` is called
Then the first call starts a 60-second window, and calls 1–30 in the window return `{ allowed: true }`. Later calls in that window return `{ allowed: false, retryAfterSeconds }`, where `retryAfterSeconds` is the rest of the window rounded up (at least 1), and they don't count. The first call at or after the window's end starts a new one.

**API-14: fail open**
Given the rate limit check throws (the Durable Object is unavailable or over its daily cap)
Then the lookup is served as if allowed, and the log says `rateLimit: 'error'`.

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

## Notes for implementation

- Test with `createApp(deps).fetch(request, env, ctx)` from `cloudflare:test`, so fake providers and a fake `log` can be passed in. Use `waitOnExecutionContext(ctx)` before reading the cache, because the cache is written with `ctx.waitUntil`. Use a different IP from `203.0.113.0/24` (a documentation range) in each rate-limit test, and a different term in each cache test.
- The Durable Object is addressed with `env.RATE_LIMITER.idFromName(ip)`, and `hit` is called over RPC. `Date.now()` is passed in from the Worker, which keeps `hit` deterministic in tests.
- `wrangler.jsonc` gets the `RATE_LIMITER` binding and a `new_sqlite_classes` migration, because Free only allows SQLite-backed Durable Objects, even unused storage. Run `pnpm --filter @litsnap/worker typegen` afterwards.

## Out of scope

- Images (M4); the web client, CSP, timeout and the live check (`lookup-client.md`).
- Per-user limits, API keys, and premium entitlements (spec §9).
