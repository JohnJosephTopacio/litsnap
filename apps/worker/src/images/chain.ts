// Finds the article, then asks every image source at once and merges their images (IMG-14, IMG-15).
// Spec: docs/features/image-providers.md.
import type { ProviderContext } from '../definitions/types';
import { commonsImages } from './commonsImages';
import type { ImageOutcome, ImageSource } from './types';
import { wikipediaImages } from './wikipediaImages';

/** Their images are shown in this order (spec §5). */
export const IMAGE_SOURCES: readonly ImageSource[] = [wikipediaImages, commonsImages];

// RED PHASE: stub until the implementation PR.
export const lookupImages: (
  term: string,
  context: ProviderContext,
  sources?: readonly ImageSource[],
) => Promise<ImageOutcome> = () => Promise.reject(new Error('lookupImages is not implemented yet'));
