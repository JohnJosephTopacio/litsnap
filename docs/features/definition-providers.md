# Feature: Definition providers

> Milestone: M3 · Status: spec + failing tests · Product spec: [spec.md §4.3, §5](../spec.md#5-lookup-chain)

## Goal

Inside the Worker, turn a normalised lookup term into a definition by asking three sources in turn: **Wiktionary**, then **dictionaryapi.dev**, then the **Wikipedia** article summary. The first one that finds something wins.

This spec covers only the providers and the chain that runs them. They're pure logic with an injected `fetch`, so they're tested against fixture responses with no network. The `/lookup` endpoint (input checks, CORS, cache, rate limit, HTTP status codes) is `lookup-api.md`. Calling the Worker from the web app is `lookup-client.md`.

## API

| Module                                         | Exports                                                                          |
| ---------------------------------------------- | -------------------------------------------------------------------------------- |
| `apps/worker/src/definitions/types.ts`         | `DefinitionProvider`, `ProviderContext`, `ProviderOutcome`, `DEFAULT_TIMEOUT_MS` |
| `apps/worker/src/definitions/wiktionary.ts`    | `wiktionary`                                                                     |
| `apps/worker/src/definitions/dictionaryApi.ts` | `dictionaryApi`                                                                  |
| `apps/worker/src/definitions/wikipedia.ts`     | `wikipedia`                                                                      |
| `apps/worker/src/definitions/chain.ts`         | `lookupDefinition(term, context, providers?)`, `DEFINITION_PROVIDERS`            |
| `packages/shared/src/lookup.ts`                | `DictionaryDefinition`, `WikipediaSummary`, `FoundDefinition`                    |

```ts
interface ProviderContext {
  fetch: typeof fetch; // the Worker's fetch in production, a fake in tests
  timeoutMs: number; // per upstream request; DEFAULT_TIMEOUT_MS = 3000
}

type ProviderOutcome =
  | { status: 'found'; definition: FoundDefinition }
  | { status: 'not-found' }
  | { status: 'failed'; reason: string }; // reason is for logs, never shown to readers

interface DefinitionProvider {
  name: 'wiktionary' | 'dictionaryapi' | 'wikipedia';
  lookup(term: string, context: ProviderContext): Promise<ProviderOutcome>;
}
```

`lookupDefinition` returns a `ProviderOutcome` too. `lookup-api.md` maps `failed` to HTTP `502`.

### Result types

`FoundDefinition` is what the modal shows. It replaces the draft's `fromWikipedia: boolean`, because a Wikipedia summary isn't a list of parts of speech:

```ts
interface DictionaryDefinition {
  from: 'dictionary';
  entries: { partOfSpeech: string; senses: string[] }[];
  note?: string; // DEF-10: "Synonym of hip roof."
  source: Attribution;
}

interface WikipediaSummary {
  from: 'wikipedia';
  title: string; // the article's title, e.g. "Hip roof"
  summary: string; // plain text
  source: Attribution;
}
```

In the implementation PR, `DefinitionSection` becomes `({ status: 'found' } & FoundDefinition) | { status: 'not-found' }`, and the modal changes with it: it shows the `note` above the entries and renders a summary as a paragraph under the article title. MODAL-7's wording (_"No dictionary entry. Summary from Wikipedia."_) is unchanged.

## Acceptance criteria

### Every provider

**DEF-1: providers never throw**
Given `fetch` rejects (a network error)
When any provider looks up a term
Then it returns `{ status: 'failed' }` rather than throwing.

**DEF-2: requests identify us**
Given any provider looks up `hipped roof`
When it calls `fetch`
Then the request has `User-Agent: LitSnap/1.0 (https://github.com/JohnJosephTopacio/litsnap)` (required by Wikimedia's [User-Agent policy](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy)) and `Accept: application/json`. The term goes into the URL with spaces as `_` (Wiktionary, Wikipedia) or `%20` (dictionaryapi.dev), percent-encoded, and the URL is exactly:

- `https://en.wiktionary.org/api/rest_v1/page/definition/hipped_roof`
- `https://api.dictionaryapi.dev/api/v2/entries/en/hipped%20roof`
- `https://en.wikipedia.org/api/rest_v1/page/summary/hipped_roof`

**DEF-3: a slow source times out**
Given an upstream request hasn't answered after `timeoutMs` (3 seconds in production)
When a provider is waiting for it
Then the request is aborted and the provider returns `failed`.

**DEF-4: HTTP statuses**
Given an upstream answers `404`, or `400` from Wiktionary or Wikipedia (an invalid title)
Then the provider returns `not-found`.
Given an upstream answers any other non-2xx status (e.g. `429`, `500`), a body that isn't JSON, or JSON that doesn't have the expected shape
Then the provider returns `failed`.

**DEF-5: terms that can't be page titles**
Given a term containing `#`, `<`, `>`, `[`, `]`, `{`, `}` or `|`
When Wiktionary or Wikipedia looks it up
Then it returns `not-found` without calling `fetch`. Wikimedia can't have pages with those characters, and `#` would otherwise be read as a link fragment (`a#b` returns the entry for `a`).

### Wiktionary

The response groups entries by language code. Each entry has a `partOfSpeech`, a `language` and `definitions[]`. Each definition's `definition` is HTML, and it may have `examples`.

**DEF-6: English entries only**
Given a response with entries in English, Translingual and other languages (`nl`, `other`)
When it's parsed
Then only entries whose `language` is `"English"` are used. With none, the result is `not-found`.

**DEF-7: senses become plain text**
Given a definition such as `<span class="usage-label-sense"></span> The <a href="/wiki/top">top</a> covering &amp; its&#160;frame`
When it's parsed
Then the sense is `The top covering & its frame`: tags removed, HTML entities decoded (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&apos;`, `&#39;`, `&nbsp;` and numeric `&#NNN;` / `&#xHH;`), whitespace collapsed, trimmed. Senses that end up empty are dropped. Examples aren't used. Parts of speech are lowercased (`Noun` → `noun`, `Proper noun` → `proper noun`).

The output is plain text that the modal renders as text, so tag stripping only has to look right. It isn't a security boundary.

**DEF-8: limits**
Given four English parts of speech, the first with seven senses
When it's parsed
Then the result has the first 3 parts of speech, in Wiktionary's order, and at most the first 5 senses of each (counted after empty senses are dropped).

**DEF-9: attribution**
Given an entry is found for `hipped roof`
Then `source` is `{ sourceName: 'Wiktionary', sourceUrl: 'https://en.wiktionary.org/wiki/hipped_roof', licence: 'CC BY-SA 4.0', licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/' }`.

**DEF-10: a term whose only senses point elsewhere is followed once**
Given every English sense of the term is a cross-reference: its HTML has the class `form-of-definition`, as Wiktionary's _"Synonym of …"_, _"plural of …"_ and _"past tense of …"_ senses do. `hipped roof` → _"Synonym of hip roof."_; `roofs` → _"plural of roof"_ (noun) and _"third-person singular simple present indicative of roof"_ (verb).
When it's looked up
Then Wiktionary fetches the **target** of the first sense: the `title` of the first link inside its `form-of-definition-link` element (`hip roof`, `roof`). The result is the target's entries, parsed as in DEF-6–DEF-8 but not followed again. `note` is the first sense's text with its first letter capitalised (_"Synonym of hip roof."_, _"Plural of roof"_), and `source` points to the target's page (`https://en.wiktionary.org/wiki/hip_roof`). At most two requests are made.

**DEF-11: if the target can't be used, the cross-references are shown as they are**
Given the target request returns `not-found` or `failed`, or the target has no English senses
When it's looked up
Then the result is the original term's own senses (e.g. _"Synonym of hip roof."_), with no `note` and the original page as `source`. The term was found, so a failed second request doesn't fail the lookup.

**DEF-12: mixed senses aren't followed**
Given a term with at least one sense that isn't a cross-reference
When it's looked up
Then only one request is made, and all its senses are shown, cross-references included.

### dictionaryapi.dev

The response is an array of homograph entries, each with `meanings[]` (`partOfSpeech`, `definitions[].definition` as plain text), `license` (`{ name, url }`) and `sourceUrls[]`. Its data comes from Wiktionary and it has gaps (it has no entry for `roof`), so it's a fallback for when Wiktionary is down or misses a word.

**DEF-13: parsing**
Given a response with two homograph entries that both have a `noun` meaning
When it's parsed
Then meanings with the same `partOfSpeech` are merged, in order of first appearance, and the DEF-7 rules for empty senses and lowercase parts of speech and the DEF-8 limits apply. Examples and synonyms aren't used.

**DEF-14: attribution, or nothing**
Given an entry is found
Then `source` is `{ sourceName: 'Wiktionary (via Free Dictionary API)', sourceUrl: <its sourceUrls[0]>, licence: <license.name>, licenceUrl: <license.url> }`, taken from the first entry used. Entries without a `license` or without `sourceUrls` are skipped, so nothing is shown without a credit. If that leaves none, the result is `not-found`.

### Wikipedia

The summary endpoint resolves redirects itself: `hipped_roof` answers with the _Hip roof_ article.

**DEF-15: article summary**
Given a summary with `type: "standard"` and a non-empty `extract`
When it's parsed
Then the result is `{ from: 'wikipedia', title, summary: extract, source: { sourceName: 'Wikipedia', sourceUrl: content_urls.desktop.page, licence: 'CC BY-SA 4.0', licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/' } }`. `extract` is already plain text, so `extract_html` isn't used.

**DEF-16: no usable summary**
Given a summary whose `type` is `"disambiguation"` (e.g. _Bass_: _"Bass or Basses may refer to:"_) or `"no-extract"`, or whose `extract` is empty
Then the result is `not-found`. A list of other articles isn't a definition.

### The chain

**DEF-17: first found wins**
Given Wiktionary finds the term
When `lookupDefinition` runs
Then it returns Wiktionary's result, and dictionaryapi.dev and Wikipedia aren't called. The order is `DEFINITION_PROVIDERS`: Wiktionary, dictionaryapi.dev, Wikipedia.

**DEF-18: not-found and failed both fall through**
Given Wiktionary returns `not-found` or `failed`
When `lookupDefinition` runs
Then it asks the next provider, and so on. Providers run one at a time, not in parallel, so a found term costs one request.

**DEF-19: nothing found**
Given no provider finds the term
Then the result is `not-found` if every provider said `not-found`, and `failed` if any of them failed. A failure might have hidden a real entry, so it mustn't be reported (or cached) as "not found".

## Notes for implementation

- Workers have no `DOMParser`. The HTML in Wiktionary senses is small and well-formed, so a regex tag strip plus an entity decoder is enough (DEF-7). The cross-reference target (DEF-10) is the `title="…"` of the first `<a>` after `class="form-of-definition-link"`. The output is rendered as text either way.
- Fixtures copy the **structure** of real responses (recorded 2026-10-26) with our own wording, so no third-party text is committed.
- Wikipedia is reached at `en.wikipedia.org`. From the owner's machine that host resets connections (like `litsnap.pages.dev`), while `en.m.wikipedia.org` answers the same API. That only affects running the Worker locally, not tests or production. `wrangler dev --remote` is the workaround.
- Wiktionary's endpoint runs on RESTBase, which Wikimedia is retiring (no date announced). The provider interface keeps a replacement to one file, and `lookup-client.md` adds a weekly live check that would catch it.

## Out of scope

- Images (M4), even though the Wikipedia summary has a `thumbnail`.
- Trying other capitalisations (`london` → `London`). Wikipedia capitalises the first letter itself, so proper nouns usually land there.
- Stemming, spelling suggestions, fuzzy Wikipedia search, and pronunciations.
- Caching, rate limiting, logging and the HTTP layer: `lookup-api.md`.
