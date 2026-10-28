# 0006: The Worker identifies itself to Wikimedia with an owner-only OAuth 2 token

- Status: accepted
- Date: 2026-10-28
- Feature: [image-providers.md](../features/image-providers.md) (IMG-17, IMG-18)

## Context

After M4 shipped, image lookups failed in production almost every time. The Worker's log said `wikipedia: details: HTTP 503`. The detailed reasons from #42 and probes from three networks showed:

- Wikimedia's Action API (`api.php`), which gives us each file's licence and author, answered with its "technical problem" page and a `Retry-After` that **counted down to the next minute**. That's a per-minute throttle window, not an outage.
- The window was shared by **every client on the same IP address**: two different User-Agents counted down together.
- Wikimedia's 2026 limits ([Wikimedia APIs/Rate limits](https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits)) give requests identified only by their IP **10 a minute**, and authenticated requests **200 a minute, per account**. Cloudflare's outgoing IPs are shared by countless other Workers, so their per-IP budget is always used up. The owner's home connection is shared too (carrier-grade NAT).
- The REST API (article summaries, media lists), which Wikimedia serves from its cache, kept working. That's why definitions never broke.

The options considered:

| Option                                         | Why not, or why                                                                                                                                                                        |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Retry automatically                            | Wikimedia's API guidelines say clients "may not circumvent these limits" and must respect `Retry-After` (15–60 s), longer than the browser waits (20 s).                               |
| The browser asks Wikimedia itself              | Each reader gets a browser budget, but readers behind shared IPs still collide. It's a larger redesign, needs CSP and spec §7 changes, and Wikimedia would see more about each reader. |
| Openverse, Unsplash, …                         | Keyword search risks unrelated images. They also throttle anonymous IPs, so we'd need an identity anyway.                                                                              |
| **An owner-only OAuth 2 token for the Worker** | **Chosen.** Requests count against one account's budget, not a shared IP's. It's free, and a small change.                                                                             |

## Decision

- The owner created a Wikimedia account used only for LitSnap. On it they registered an **owner-only OAuth 2 consumer**, "This consumer is for use only by …", which needs no review. It has **basic rights only** (no editing, uploading or other grants), works on all projects (`*`) and from any IP, because Cloudflare's addresses change.
- Its access token is the Worker secret **`WIKIMEDIA_TOKEN`**, set as an encrypted secret in the Cloudflare dashboard. It's never in the repo, CI or a log. Secrets survive `wrangler deploy`; plain variables don't.
- The Worker sends `Authorization: Bearer <token>` **only on Action API requests** to Wikimedia's own hosts (IMG-17). Cached REST requests don't need it and stay anonymous.
- Wikimedia's OAuth docs say its CDN also identifies clients by cookie, and clients "must implement support for returning cookies". So the Worker keeps the cookies Wikimedia sets on those responses, in memory, per site, and sends them back (IMG-18). These identify LitSnap's Worker, not readers: readers' requests never carry them.

## Consequences

- **All readers share one budget,** about 200 Action API requests a minute. An uncached image lookup uses 1–3, so about 60–200 new words a minute. Repeats come from our 30-day cache. If LitSnap outgrows that, the next steps are asking Wikimedia for more (bot-traffic@wikimedia.org) or Wikimedia Enterprise. For a commercial premium tier (spec §9), revisit this, with the legal review it already requires.
- **The account is the owner's responsibility** under Wikimedia's Terms of Use. It's used by one person, and only for reading. If LitSnap's traffic misbehaved, Wikimedia could disable the consumer or the account. The owner's personal accounts are unaffected, because this one is separate.
- **If the token leaks,** someone could read Wikimedia's API in LitSnap's name, and nothing more. The owner revokes it at Meta-Wiki → `Special:OAuthManageMyGrants` (or the consumer's page), makes a new one, and replaces the secret.
- **Without the secret** (local `pnpm dev`, tests, the weekly live check on GitHub), requests are anonymous, as before. The live check will keep failing on the image sources until its run also gets the token, which would need a GitHub secret: a follow-up the owner can choose.
- The Worker's cookie jar lives in memory, so it's lost whenever Cloudflare starts a new instance. A Durable Object could persist it if logs show that matters.
