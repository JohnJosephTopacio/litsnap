// The Wikipedia article whose title is exactly the term, as for definitions (IMG-5).
// Spec: docs/features/image-providers.md.
import { getJson, pageTitle } from '../definitions/http';
import { isRecord } from '../definitions/text';
import type { ProviderContext } from '../definitions/types';
import type { Article } from './types';

export type ArticleOutcome =
  | { status: 'found'; article: Article }
  | { status: 'not-found' }
  | { status: 'failed'; reason: string };

const API = 'https://en.wikipedia.org/api/rest_v1/page/summary/';

export async function findArticle(term: string, context: ProviderContext): Promise<ArticleOutcome> {
  const title = pageTitle(term);
  if (title === undefined) return { status: 'not-found' };
  const reply = await getJson(API + title, context, [400, 404]);
  if (reply.status === 'missing') return { status: 'not-found' };
  if (reply.status === 'failed') return reply;

  const { body } = reply;
  if (!isRecord(body) || typeof body.type !== 'string' || typeof body.title !== 'string')
    return { status: 'failed', reason: 'unexpected response' };
  // Disambiguation and no-extract pages aren't the term's article (DEF-16).
  if (body.type !== 'standard') return { status: 'not-found' };
  const id = body.wikibase_item;
  const wikidataId = typeof id === 'string' && /^Q\d+$/.test(id) ? id : undefined;
  return {
    status: 'found',
    article: { title: body.title, ...(wikidataId === undefined ? {} : { wikidataId }) },
  };
}
