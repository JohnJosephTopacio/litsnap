# 0004: Caching and rate limiting for `/lookup`

- Status: accepted
- Date: 2026-10-26
- Feature: [lookup-api.md](../features/lookup-api.md)

## Context

Every lookup the Worker can't answer from a cache costs one to four requests to Wikimedia and dictionaryapi.dev (DEF-17…19). The spec ([§8](../spec.md#8-architecture)) asks for a 30-day cache and a rate limit of about 30 lookups a minute per IP. We're on Cloudflare's **Free plan**, and the owner wants it to stay free.

The limit isn't mainly about our bill. On Free, going over a quota makes requests fail rather than cost money. The risk is someone scripting our Worker to hammer Wikimedia. Every request carries our `User-Agent` (DEF-2), so Wikimedia could block **us**, and lookups would break for every reader.

The documentation didn't say whether the options work on Free or on a `workers.dev` address, so on 2026-10-26 we deployed a throwaway Worker (`litsnap-probe`) to the owner's account, tested it, and deleted it:

| Question                                            | Result                                                                                                                        |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Does Free accept the Workers rate limiting binding? | Yes, the deploy succeeded.                                                                                                    |
| Is it enforced? (limit 5 per 60 s, one key)         | **No.** 57 of 57 calls over about 4 minutes were allowed. "Approximate" doesn't explain that, so we can't rely on it on Free. |
| Does the Cache API store on `workers.dev`?          | Yes, per data centre. Repeat calls mostly hit, but some landed on a different cache and missed.                               |

## Decision

**Cache:** the Cache API (`caches.default`).

- Each section is cached on its own, under `v1/<section>/<term>` (M3 only caches `definition`), so M4's images can't inherit stale entries.
- Found definitions are kept 30 days and not-found ones 1 day, so new Wiktionary entries show up. Failures are never cached (DEF-19).
- `v1` is bumped when parsing changes, so old entries are ignored rather than migrated.

**Rate limit:** a **Durable Object** per client IP (`RateLimiter`) counts requests in memory in a fixed 60-second window. Each IP gets 30 requests, and every request counts, including cache hits and invalid ones. If the object fails, the request goes ahead (fail open).

## Why

- **Cache API over Workers KV:** KV is global, so its hit rate would be better, but KV's Free tier allows 1,000 writes a day, and every new term is a write. The Cache API is free and has no write quota. A miss only costs an upstream request we'd have made anyway.
- **Durable Object over the rate limiting binding:** the binding is the simpler API, but the probe showed it isn't enforced on Free. A Durable Object is exact for one IP, because a single object sees every request from it. Durable Objects are on Free (SQLite-backed only), with hard daily caps (100,000 requests) that cause errors, not charges.
- **In memory, no storage:** a minute-long counter doesn't need to survive the object being evicted. Losing it only gives an IP a fresh minute. With no writes, the 100,000-rows-written cap doesn't apply.
- **Fail open:** the limit protects Wikimedia from abuse. It shouldn't take lookups down for everyone if Durable Objects have a bad day or we reach the daily cap.
- **Fixed window rather than sliding:** at 30 a minute, the worst case is about 60 requests in two seconds around a window edge, which is harmless. A sliding window would need a list of timestamps per IP.

## Consequences

- Every lookup, cached or not, costs two Free-plan requests: one Worker and one Durable Object. Both quotas are 100,000 a day, so a day's ceiling is about 100,000 lookups.
- Each lookup gains a few milliseconds while the Worker talks to the Durable Object. That object lives near where its IP first connected.
- The Durable Object's name is the IP, but Cloudflare stores only a hash of it as the object's ID, and nothing is written to storage. The IP is never logged (API-16).
- If the rate limiting binding is ever enforced on Free, swapping it in only changes `rateLimit.ts`.
- `wrangler.jsonc` gets a Durable Object binding and a migration (`new_sqlite_classes`). The CI deploy token needs permission to edit Workers scripts, which already covers Durable Objects.
