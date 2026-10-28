// Finds the article, then asks every image source at once and merges their images (IMG-14, IMG-15).
// Spec: docs/features/image-providers.md.
import type { LookupImage } from '@litsnap/shared';
import type { ProviderContext } from '../definitions/types';
import { findArticle } from './article';
import { commonsImages } from './commonsImages';
import { MAX_IMAGES, type ImageOutcome, type ImageSource } from './types';
import { wikipediaImages } from './wikipediaImages';

/** Their images are shown in this order (spec §5). */
export const IMAGE_SOURCES: readonly ImageSource[] = [wikipediaImages, commonsImages];

export async function lookupImages(
  term: string,
  context: ProviderContext,
  sources: readonly ImageSource[] = IMAGE_SOURCES,
): Promise<ImageOutcome> {
  const found = await findArticle(term, context);
  if (found.status !== 'found') return found;
  // In parallel, so a lookup is three rounds of requests at most (IMG-14).
  const answers = await Promise.all(
    sources.map(async (source) => ({
      source,
      outcome: await source.images(found.article, context),
    })),
  );

  const images: LookupImage[] = [];
  const seen = new Set<string>();
  /** The first failure before the grid was full: it might have hidden images (IMG-15). */
  let failure: string | undefined;
  for (const { source, outcome } of answers) {
    if (images.length >= MAX_IMAGES) break;
    if (outcome.status === 'failed') {
      failure ??= `${source.name}: ${outcome.reason}`;
      continue;
    }
    if (outcome.status === 'not-found') continue;
    for (const image of outcome.images) {
      if (images.length >= MAX_IMAGES) break;
      if (seen.has(image.attribution.sourceUrl)) continue;
      seen.add(image.attribution.sourceUrl);
      images.push(image);
    }
  }
  if (images.length === 0)
    return failure === undefined ? { status: 'not-found' } : { status: 'failed', reason: failure };
  // What was found is shown, even if a source failed (IMG-15, changed in #41).
  return failure === undefined
    ? { status: 'found', images }
    : { status: 'found', images, incomplete: { reason: failure } };
}
