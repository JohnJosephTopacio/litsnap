// Files in the article's Commons category, found through Wikidata (IMG-13).
// Spec: docs/features/image-providers.md.
import type { LookupImage } from '@litsnap/shared';
import { getJson } from '../definitions/http';
import { isRecord } from '../definitions/text';
import { filePages, toLookupImage } from './files';
import { MAX_IMAGES, type ImageOutcome, type ImageSource } from './types';

const WIKIDATA = 'https://www.wikidata.org/w/api.php';
const COMMONS = 'https://commons.wikimedia.org/w/api.php';
/** As for the article's images: each file slows Wikimedia's first answer (IMG-13). */
const CANDIDATES = '10';

const NOT_FOUND: ImageOutcome = { status: 'not-found' };
const UNEXPECTED: ImageOutcome = { status: 'failed', reason: 'unexpected response' };

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
    const reply = await getJson(`${WIKIDATA}?${query.toString()}`, context);
    if (reply.status === 'missing') return NOT_FOUND;
    if (reply.status === 'failed') return reply;
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
    if (files.status === 'failed') return files;
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
