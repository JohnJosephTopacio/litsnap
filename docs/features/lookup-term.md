# Feature: Lookup term

> Milestone: M2 · Status: done · Product spec: [spec.md §4.1–4.2, §5](../spec.md#5-lookup-chain)

## Goal

Turn what the reader selected into three things the lookup UI needs:

- the **lookup term**: the normalised string sent to the Worker and used in the Google link (`"Hipped-Roof,"` → `hipped roof`)
- the **display term**: what the modal header shows, keeping the book's casing (`Hipped-Roof`)
- the **source sentence**: the sentence the selection came from, shown in the modal header so the reader can judge which meaning fits

It also counts the words in a selection. The selection menu (M2, `selection-menu.md`) only appears for 1–6 words.

All of this runs in the browser. The source sentence never leaves it, and the Worker only ever receives the lookup term ([spec §7](../spec.md#7-privacy--data)).

## API

| Function                 | Package                                 | Used by                                                            |
| ------------------------ | --------------------------------------- | ------------------------------------------------------------------ |
| `normalise(selection)`   | `packages/shared` (`term.ts`)           | web (lookup, Google link), Worker in M3 (re-normalises, cache key) |
| `countWords(term)`       | `packages/shared`                       | selection menu (1 ≤ words ≤ `MAX_LOOKUP_WORDS` = 6)                |
| `displayTerm(selection)` | `packages/shared`                       | modal header                                                       |
| `sourceSentence(range)`  | `apps/web/src/lookup/sourceSentence.ts` | modal header; returns `{ before, match, after }`                   |

`normalise`, `countWords` and `displayTerm` are in `shared` so the Worker (M3) runs exactly the same normalisation. The Worker mustn't trust the client, and `Hipped-Roof,` and `hipped roof` must hit the same cache entry. `sourceSentence` works on DOM ranges, so it stays in the web app.

`sourceSentence` returns three strings rather than HTML. The modal renders `before`, then `match` inside a `<mark>`, then `after`, all as text (RD-24, RD-25).

## Acceptance criteria

### Normalisation

**TERM-1: the spec's rules**
Given the selection `"Hipped-Roof,"` or `"  flying\n\tbuttress  "`
When it is normalised
Then the result is `hipped roof` or `flying buttress`: trimmed, surrounding punctuation stripped, lowercased, whitespace runs collapsed to one space (including non-breaking spaces), hyphens treated as spaces.

**TERM-2: only surrounding punctuation is stripped**
Given the selection `“(buttress)!”`, `U.S.`, `o'clock` or `Gatsby's`
When it is normalised
Then the result is `buttress`, `u.s`, `o'clock` or `gatsby's`. Leading and trailing characters that aren't letters or digits are removed; punctuation inside the term is kept. There's no stemming: `roofs` stays `roofs`.

**TERM-3: invisible characters are removed**
Given a selection containing a soft hyphen (U+00AD), zero-width space (U+200B), zero-width non-joiner or joiner (U+200C, U+200D), word joiner (U+2060) or byte-order mark (U+FEFF), such as `hip\u00ADped`
When it is normalised
Then those characters are removed: `hipped`. EPUBs often contain soft hyphens for line-breaking. They're invisible but end up in the selection.

**TERM-4: Unicode is normalised to NFC, and accents are kept**
Given `cafe\u0301` (`e` + combining accent) or `Café` (precomposed `é`)
When they are normalised
Then both become the same string, `café`, with the precomposed `é` (U+00E9).

**TERM-5: curly quotes become straight**
Given `Gatsby’s` or `‘tis`
When they are normalised
Then the results are `gatsby's` and `tis`. `‘ ’ ʼ` become `'` and `“ ”` become `"` (before stripping, so a leading quote is then removed as punctuation).

**TERM-6: dashes and slashes separate words**
Given `roof—and`, `1914–1918`, `and/or` or `mother\u2010in\u2010law` (U+2010 hyphens)
When they are normalised
Then the results are `roof and`, `1914 1918`, `and or` and `mother in law`. The hyphen-minus and U+2010–U+2015 (hyphen, non-breaking hyphen, figure dash, en dash, em dash, horizontal bar) are treated like the spec's hyphens, and so is `/`.

**TERM-7: nothing left**
Given a selection of only punctuation, whitespace or invisible characters (`—`, `"  "`, `!?`, `\u00AD`)
When it is normalised
Then the result is the empty string.

### Word count

**TERM-8: counting words**
Given a normalised term
When its words are counted
Then the count is the number of space-separated pieces containing at least one letter or digit: `hipped roof` → 2, `mother in law` (from `mother-in-law`) → 3, `roof , and` → 2, `""` → 0. `MAX_LOOKUP_WORDS` is 6.

### Display term

**TERM-9: display term keeps the book's casing**
Given the selection `“Hipped-Roof,”` or `Mr.\n  Utterson`
When the display term is computed
Then the result is `Hipped-Roof` or `Mr. Utterson`. Only invisible characters are removed (as in TERM-3), whitespace is collapsed, Unicode is NFC-normalised, and surrounding punctuation is stripped. Case, internal hyphens and quotes are kept.

### Source sentence

A **block** is the nearest ancestor of the selection that is one of `p`, `li`, `blockquote`, `h1`–`h6`, `dd`, `dt`, `td`, `th`, `figcaption`, `pre`, `div`, `section`, `article` or `body`. Many EPUBs use `<div class="para">` for paragraphs, so `div` counts. Sentences are found with `Intl.Segmenter('en', { granularity: 'sentence' })` over the block's text, then corrected as described in TERM-11 and TERM-12.

In every case, `before + match + after` is what the modal shows. `match` is the selected text, and each part has whitespace collapsed and invisible characters removed. The whole is trimmed at both ends.

**TERM-10: the sentence around the selection**
Given `<p>The door was shut. The house had a hipped roof and two chimneys. Nobody came.</p>` and a selection of `hipped roof`
When the source sentence is found
Then it is `{ before: "The house had a ", match: "hipped roof", after: " and two chimneys." }`. A heading or caption with no final punctuation is one sentence.

**TERM-11: abbreviations don't end a sentence**
Given `<p>He nodded. Mr. Utterson the lawyer was a man of a rugged countenance.</p>` and a selection of `rugged countenance`
When the source sentence is found
Then it starts at `Mr. Utterson`. `Intl.Segmenter` (in Chromium and Node) breaks after `Mr.`, so a segment is joined to the next one when it ends with one of these abbreviations, ignoring case: Mr, Mrs, Ms, Dr, St, Mt, Prof, Rev, Sr, Jr, Gen, Capt, Col, Lt, Sgt, vs, etc, e.g, i.e, or a single capital-letter initial (`J. G. Ballard`), followed by `.`.

**TERM-12: a lowercase continuation doesn't start a new sentence**
Given `<p>“Who is he?” she asked. “Nobody.”</p>` and a selection of `asked`
When the source sentence is found
Then the sentence is `“Who is he?” she asked.`. A segment is joined to the previous one when its first letter, after any opening quotes or brackets, is lowercase.

**TERM-13: inline markup inside the sentence**
Given `<p>It had a <em>hipped</em> <a href="#n1">roof</a>.</p>` and a selection of `hipped roof` that starts inside the `<em>` and ends inside the `<a>`
When the source sentence is found
Then the block is the `<p>`, not the `<em>`, and the result is `{ before: "It had a ", match: "hipped roof", after: "." }`.

**TERM-14: a selection across sentences**
Given `<p>One. It ended with a flying buttress. Then it went on. Three.</p>` and a selection of `buttress. Then`
When the source sentence is found
Then the result covers both sentences: `It ended with a flying buttress. Then it went on.`

**TERM-15: a selection across paragraphs**
Given `<div><p>He saw the roof.</p><p>It was hipped and old.</p><p>Later.</p></div>` and a selection from `roof` in the first paragraph to `hipped` in the second
When the source sentence is found
Then the block is the `<div>` (the nearest block containing the whole selection), and the result runs from the start of the first sentence to the end of the second one: `{ before: "He saw the ", match: "roof. It was hipped", after: " and old." }`. The paragraph break becomes a space, and `Later.` isn't included. The corrections in TERM-11 and TERM-12 never join sentences across a paragraph break: if the paragraph before ended with `Dr.`, it still isn't included.

**TERM-16: whitespace and invisible characters from the HTML source**
Given a paragraph whose source text has newlines, indentation and soft hyphens (`<p>\n    The hip\u00ADped\n    roof.\n</p>`)
When the source sentence is found
Then the parts have single spaces and no invisible characters: `The hipped roof.` (with the match wherever it was selected).

**TERM-17: very long sentences are shortened around the selection**
Given a sentence longer than 300 characters
When the source sentence is found
Then the visible text, `before + match + after` without the ellipses, is at most 300 characters. `match` is kept whole. The rest of the 300 characters is split evenly before and after it, and any space a short side doesn't use goes to the other side. Text is cut only between words, and a cut side starts or ends with `…`.

## Notes for implementation

- Build the block's text from its text nodes in document order, inserting a line break wherever two neighbouring text nodes belong to different blocks. `Range.toString()` would join paragraphs with nothing in between (`roof.It was`), and `Intl.Segmenter` doesn't break a sentence there; it always breaks at a line break. Map the range's start and end into this text, so the selection and the sentences use the same offsets.
- Collapse whitespace and remove invisible characters **after** splitting the text into `before`, `match` and `after`, so offsets stay valid.
- `Intl.Segmenter` is in every browser we support and in Node, so there's no dependency.

## Out of scope

- Using the selection's word count or position to show anything: that's `selection-menu.md`.
- Stemming or lemmatisation (`roofs` → `roof`), spelling correction, case-sensitive lookups (`US` vs `us`).
- Words split by a line-break hyphen in PDFs (`hip-` / `ped`): M5.
- Languages other than English.
