// Files in the article's Commons category, found through Wikidata (IMG-13).
// Spec: docs/features/image-providers.md.
import type { ImageSource } from './types';

// RED PHASE: stub until the implementation PR.
export const commonsImages: ImageSource = {
  name: 'commons',
  images: () => Promise.reject(new Error('commonsImages is not implemented yet')),
};
