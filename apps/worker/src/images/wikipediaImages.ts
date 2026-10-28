// The article's own gallery images, in article order (IMG-12). Spec: docs/features/image-providers.md.
import type { LookupImage } from '@litsnap/shared';
import { getJson, pageTitle } from '../definitions/http';
import { isRecord } from '../definitions/text';
import { filePages, toLookupImage } from './files';
import { failedAt, MAX_IMAGES, type ImageOutcome, type ImageSource } from './types';

const MEDIA_LIST = 'https://en.wikipedia.org/api/rest_v1/page/media-list/';
const API = 'https://en.wikipedia.org/w/api.php';
/**
 * Asked about in one request: enough to fill the grid after the licence filter. Wikimedia's first
 * answer slows down with each file (20 took 10 s), so not more (IMG-12).
 */
const CANDIDATES = 10;

const NOT_FOUND: ImageOutcome = { status: 'not-found' };

export const wikipediaImages: ImageSource = {
  name: 'wikipedia',
  async images(article, context) {
    const title = pageTitle(article.title);
    if (title === undefined) return NOT_FOUND;
    const list = await getJson(MEDIA_LIST + title, context, [400, 404]);
    if (list.status === 'missing') return NOT_FOUND;
    if (list.status === 'failed') return failedAt('media-list', list.reason);
    if (!isRecord(list.body) || !Array.isArray(list.body.items))
      return failedAt('media-list', 'unexpected response');

    const gallery = list.body.items
      .filter(isRecord)
      .filter((item) => item.type === 'image' && item.showInGallery === true)
      .flatMap((item) => {
        if (typeof item.title !== 'string') return [];
        const caption = isRecord(item.caption) ? item.caption.text : undefined;
        return [
          {
            file: item.title.replaceAll('_', ' '),
            caption: typeof caption === 'string' ? caption : undefined,
          },
        ];
      })
      .slice(0, CANDIDATES);
    if (gallery.length === 0) return NOT_FOUND;

    const reply = await filePages(
      API,
      { titles: gallery.map(({ file }) => file).join('|') },
      context,
    );
    if (reply.status === 'missing') return NOT_FOUND;
    if (reply.status === 'failed') return failedAt('details', reply.reason);
    const pages = new Map(reply.pages.filter(isRecord).map((page) => [page.title, page] as const));
    const images = gallery
      .map(({ file, caption }) => toLookupImage(pages.get(file), caption))
      .filter((image): image is LookupImage => image !== undefined)
      .slice(0, MAX_IMAGES);
    return images.length > 0 ? { status: 'found', images } : NOT_FOUND;
  },
};
