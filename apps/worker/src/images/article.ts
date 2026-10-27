// The Wikipedia article whose title is exactly the term, as for definitions (IMG-5).
// Spec: docs/features/image-providers.md.
import type { ProviderContext } from '../definitions/types';
import type { Article } from './types';

export type ArticleOutcome =
  | { status: 'found'; article: Article }
  | { status: 'not-found' }
  | { status: 'failed'; reason: string };

// RED PHASE: stub until the implementation PR.
export const findArticle: (
  term: string,
  context: ProviderContext,
) => Promise<ArticleOutcome> = () =>
  Promise.reject(new Error('findArticle is not implemented yet'));
