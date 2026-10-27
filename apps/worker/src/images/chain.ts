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
  for (const { source, outcome } of answers) {
    if (images.length >= MAX_IMAGES) break;
    // A failure might have hidden images, unless the grid was already full (IMG-15).
    if (outcome.status === 'failed')
      return { status: 'failed', reason: `${source.name}: ${outcome.reason}` };
    if (outcome.status === 'not-found') continue;
    for (const image of outcome.images) {
      if (images.length >= MAX_IMAGES) break;
      if (seen.has(image.attribution.sourceUrl)) continue;
      seen.add(image.attribution.sourceUrl);
      images.push(image);
    }
  }
  return images.length > 0 ? { status: 'found', images } : { status: 'not-found' };
}
