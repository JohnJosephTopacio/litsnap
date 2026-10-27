// The article's own gallery images, in article order (IMG-12). Spec: docs/features/image-providers.md.
import type { ImageSource } from './types';

// RED PHASE: stub until the implementation PR.
export const wikipediaImages: ImageSource = {
  name: 'wikipedia',
  images: () => Promise.reject(new Error('wikipediaImages is not implemented yet')),
};
