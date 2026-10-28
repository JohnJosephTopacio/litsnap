// Files in the article's Commons category, found through Wikidata (IMG-13).
// Spec: docs/features/image-providers.md.
import type { LookupImage } from '@litsnap/shared';
import { isRecord } from '../definitions/text';
import { filePages, toLookupImage } from './files';
import { failedAt, MAX_IMAGES, type ImageOutcome, type ImageSource } from './types';
import { actionApiJson } from './wikimedia';

const WIKIDATA = 'https://www.wikidata.org/w/api.php';
const COMMONS = 'https://commons.wikimedia.org/w/api.php';
/** As for the article's images: each file slows Wikimedia's first answer (IMG-13). */
const CANDIDATES = '10';

const NOT_FOUND: ImageOutcome = { status: 'not-found' };
const UNEXPECTED = failedAt('wikidata', 'unexpected response');

export const commonsImages: ImageSource = {
  name: 'commons',
  async images(article, context) {
    if (article.wikidataId === undefined) return NOT_FOUND;
    const query = new URLSearchParams({
      action: 'wbgetclaims',
      format: 'json',
      entity: article.wikidataId,
      property: 'P373',
    });
    const reply = await actionApiJson(`${WIKIDATA}?${query.toString()}`, context);
    if (reply.status === 'missing') return NOT_FOUND;
    if (reply.status === 'failed') return failedAt('wikidata', reply.reason);
    const { body } = reply;
    if (!isRecord(body) || !isRecord(body.claims)) return UNEXPECTED;
    const claims = body.claims.P373;
    if (claims === undefined) return NOT_FOUND;
    if (!Array.isArray(claims)) return UNEXPECTED;
    const first: unknown = claims[0];
    const snak = isRecord(first) ? first.mainsnak : undefined;
    const data = isRecord(snak) ? snak.datavalue : undefined;
    const name = isRecord(data) ? data.value : undefined;
    if (typeof name !== 'string') return NOT_FOUND;

    const files = await filePages(
      COMMONS,
      {
        generator: 'categorymembers',
        gcmtitle: `Category:${name}`,
        gcmtype: 'file',
        gcmlimit: CANDIDATES,
      },
      context,
    );
    if (files.status === 'missing') return NOT_FOUND;
    if (files.status === 'failed') return failedAt('category', files.reason);
    const byTitle = (page: Record<string, unknown>) => String(page.title);
    const images = files.pages
      .filter(isRecord)
      .sort((a, b) => (byTitle(a) < byTitle(b) ? -1 : byTitle(a) > byTitle(b) ? 1 : 0))
      .map((page) => toLookupImage(page))
      .filter((image): image is LookupImage => image !== undefined)
      .slice(0, MAX_IMAGES);
    return images.length > 0 ? { status: 'found', images } : NOT_FOUND;
  },
};
