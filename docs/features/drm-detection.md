# Feature: DRM detection

> Milestone: M1 · Status: proposed · Product spec: [spec.md §3](../spec.md#3-supported-files)

## Goal

Before an EPUB is rendered or stored, decide whether LitSnap can open it. DRM-protected books are rejected with a clear message and links to DRM-free sources. Broken files get a separate message.

Detection only **looks for markers** of DRM. It never decrypts, unwraps or works around anything (see the hard rules in [CLAUDE.md](../../CLAUDE.md)).

## Interface

A pure function in `apps/web`, with no DOM or foliate dependency, so it can be unit-tested with Vitest:

```ts
type EpubInspection =
  | { status: 'ok' }
  | {
      status: 'drm';
      scheme: 'adobe-adept' | 'readium-lcp' | 'apple-fairplay' | 'unknown-encryption';
    }
  | { status: 'invalid' };

function inspectEpub(file: Blob): Promise<EpubInspection>;
```

## Rules

An EPUB is a ZIP. The function reads the ZIP's entry list and, when present, `META-INF/encryption.xml`. Rules are checked in this order:

1. Not a readable ZIP, or no `META-INF/container.xml` → `invalid`.
2. `META-INF/rights.xml` exists → `drm` / `adobe-adept`.
3. `META-INF/license.lcpl` exists → `drm` / `readium-lcp`.
4. `META-INF/sinf.xml` exists → `drm` / `apple-fairplay`.
5. `META-INF/encryption.xml` contains any `EncryptedData` whose `EncryptionMethod/@Algorithm` is **not** one of the font-obfuscation algorithms below → `drm` / `unknown-encryption`.
6. Otherwise → `ok`.

Font-obfuscation algorithms (these are **not** DRM: many DRM-free books use them to discourage font extraction):

- `http://www.idpf.org/2008/embedding` (IDPF)
- `http://ns.adobe.com/pdf/enc#RC` (Adobe)

## Acceptance criteria

**DRM-1: DRM-free book opens**
Given an EPUB with `META-INF/container.xml` and no `encryption.xml`
When it is inspected
Then the result is `ok`.

**DRM-2: font obfuscation is not DRM**
Given an EPUB whose `encryption.xml` only lists the IDPF and/or Adobe font-obfuscation algorithms
When it is inspected
Then the result is `ok`.

**DRM-3: Adobe ADEPT**
Given an EPUB containing `META-INF/rights.xml`
When it is inspected
Then the result is `drm` with scheme `adobe-adept`.

**DRM-4: Readium LCP**
Given an EPUB containing `META-INF/license.lcpl`
When it is inspected
Then the result is `drm` with scheme `readium-lcp`.

**DRM-5: Apple FairPlay**
Given an EPUB containing `META-INF/sinf.xml`
When it is inspected
Then the result is `drm` with scheme `apple-fairplay`.

**DRM-6: unknown encryption**
Given an EPUB whose `encryption.xml` lists an algorithm other than font obfuscation (e.g. `http://www.w3.org/2001/04/xmlenc#aes128-cbc`), even alongside font-obfuscation entries
When it is inspected
Then the result is `drm` with scheme `unknown-encryption`.

**DRM-7: not a ZIP**
Given a file that is not a ZIP (e.g. a PDF or random bytes renamed to `.epub`)
When it is inspected
Then the result is `invalid`.

**DRM-8: ZIP but not an EPUB**
Given a ZIP with no `META-INF/container.xml`
When it is inspected
Then the result is `invalid`.

**DRM-9: unparseable encryption.xml**
Given an EPUB whose `encryption.xml` is not well-formed XML
When it is inspected
Then the result is `drm` with scheme `unknown-encryption`. We can't prove the book is unencrypted, so foliate would fail on it anyway.

## What the user sees

The reader ([epub-reader.md](epub-reader.md)) maps results to messages. Rejected files are **never stored**.

| Result    | Message                                                                                                                                                              |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `drm`     | _"This book is DRM-protected and can't be opened."_ plus links to [Project Gutenberg](https://www.gutenberg.org/) and [Standard Ebooks](https://standardebooks.org/) |
| `invalid` | _"This file couldn't be opened as an EPUB."_                                                                                                                         |

The `scheme` is for tests and debugging. It is not shown to the user.

## Out of scope

- PDF DRM (M5).
- Telling the user which store or DRM system a book came from.
