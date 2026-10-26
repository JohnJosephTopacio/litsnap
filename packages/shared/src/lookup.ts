// What a lookup asks for and gets back. Spec: docs/spec.md §4–5; docs/features/lookup-modal.md.
//
// DRAFT: `LookupResult` is what the M3 Worker's `/lookup` is expected to return. M3 (definitions)
// and M4 (images) may change it. Network errors and rate limits are thrown, not results.

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

export type DefinitionSection =
  | {
      status: 'found';
      /** No dictionary entry: this is a Wikipedia article summary (spec §4.3). */
      fromWikipedia: boolean;
      entries: { partOfSpeech: string; senses: string[] }[];
      source: Attribution;
    }
  | { status: 'not-found' };

export interface LookupImage {
  thumbUrl: string;
  fullUrl: string;
  /** From the image's caption or description (spec §4.4). */
  alt: string;
  width: number;
  height: number;
  attribution: Attribution;
}

export type ImageSection =
  { status: 'found'; /** At most 6. */ images: LookupImage[] } | { status: 'not-found' };

export interface LookupResult {
  /** The normalised term that was looked up. */
  term: string;
  /** Present when the kind was `'definition'` or `'both'`. */
  definition?: DefinitionSection;
  /** Present when the kind was `'image'` or `'both'`. */
  images?: ImageSection;
}
