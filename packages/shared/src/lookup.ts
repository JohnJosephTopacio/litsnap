// What a lookup asks for and gets back. Spec: docs/spec.md §4–5; docs/features/lookup-modal.md.
//
// Definitions are settled (definition-providers.md), and so are images (image-providers.md).
// A section can fail on its own (lookup-api.md, API-18). Network errors, rate limits and a 502 are
// thrown, not results.

/** The selection menu's three choices (MENU-7). */
export type LookupKind = 'definition' | 'image' | 'both';

/** Who made it, under what licence, and where it came from (spec §4.3–4.4). */
export interface Attribution {
  author?: string;
  licence?: string;
  licenceUrl?: string;
  sourceName: string;
  sourceUrl: string;
}

/** A dictionary entry, from Wiktionary or dictionaryapi.dev (docs/features/definition-providers.md). */
export interface DictionaryDefinition {
  from: 'dictionary';
  entries: { partOfSpeech: string; senses: string[] }[];
  /** The term's own sense when it only pointed to another entry, shown instead (DEF-10). */
  note?: string;
  source: Attribution;
}

/** No dictionary entry: the Wikipedia article's summary (spec §4.3, DEF-15). */
export interface WikipediaSummary {
  from: 'wikipedia';
  /** The article's title, e.g. "Hip roof" for `hipped roof`. */
  title: string;
  /** Plain text. */
  summary: string;
  source: Attribution;
}

export type FoundDefinition = DictionaryDefinition | WikipediaSummary;

/** `failed`: this section couldn't be looked up, though the other one was (API-18). */
export type DefinitionSection =
  ({ status: 'found' } & FoundDefinition) | { status: 'not-found' } | { status: 'failed' };

/** A freely licensed image from Wikipedia or Commons (docs/features/image-providers.md). */
export interface LookupImage {
  /** 330 px wide, or the original if narrower. Always on `upload.wikimedia.org` (IMG-9). */
  thumbUrl: string;
  /** 1280 px wide, or the original if narrower. */
  fullUrl: string;
  /** The article's caption, else the file's description, else its title (IMG-11). */
  alt: string;
  /** The file's title, which CC 3.0 and earlier ask to be credited. */
  title: string;
  /** E.g. `image/gif`, which the modal hides under `prefers-reduced-motion`. */
  mime: string;
  /** The original's size, for the placeholder's aspect ratio. */
  width: number;
  height: number;
  attribution: Attribution;
}

export type ImageSection =
  | { status: 'found'; /** At most 6. */ images: LookupImage[] }
  | { status: 'not-found' }
  | { status: 'failed' };

export interface LookupResult {
  /** The normalised term that was looked up. */
  term: string;
  /** Present when the kind was `'definition'` or `'both'`. */
  definition?: DefinitionSection;
  /** Present when the kind was `'image'` or `'both'`. */
  images?: ImageSection;
}

/** The body of a `/lookup` error response (docs/features/lookup-api.md). */
export interface LookupErrorBody {
  error: 'invalid-request' | 'rate-limited' | 'upstream-failed';
}
