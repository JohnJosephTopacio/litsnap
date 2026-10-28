// The contract every image source implements. Spec: docs/features/image-providers.md.
import type { LookupImage } from '@litsnap/shared';
import type { ProviderContext } from '../definitions/types';

/** At most this many images are found (spec §4.4). */
export const MAX_IMAGES = 6;
/** Thumbnail and enlarged widths. Both are Wikimedia standard steps, the only widths it serves. */
export const THUMB_WIDTH = 330;
export const FULL_WIDTH = 1280;
/** File details in production (IMG-3): their first request took up to 10 s (measured, #41). */
export const DETAILS_TIMEOUT_MS = 10_000;

/** The Wikipedia article whose title is exactly the term (IMG-5). */
export interface Article {
  /** E.g. "Hip roof" for `hipped roof`. */
  title: string;
  /** E.g. "Q162034". */
  wikidataId?: string;
}

/** `reason` is for logs, never shown to readers. */
export type ImageOutcome =
  // `incomplete`: a source failed before the grid was full, so there may be more (IMG-15).
  | { status: 'found'; images: LookupImage[]; incomplete?: { reason: string } }
  | { status: 'not-found' }
  | { status: 'failed'; reason: string };

export interface ImageSource {
  name: 'wikipedia' | 'commons';
  /** Never throws: errors are `failed` (IMG-1). */
  images(article: Article, context: ProviderContext): Promise<ImageOutcome>;
}
