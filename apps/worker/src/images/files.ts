// From an imageinfo entry to an image we may show: licence, credit, URLs, alt text (IMG-6…11).
// Spec: docs/features/image-providers.md.
import type { LookupImage } from '@litsnap/shared';
import { getJson } from '../definitions/http';
import { htmlToText, isRecord } from '../definitions/text';
import type { ProviderContext } from '../definitions/types';
import { FULL_WIDTH, THUMB_WIDTH } from './types';

/** The imageinfo parameters both details requests end with, in this order. */
export const FILE_DETAILS: Readonly<Record<string, string>> = {
  prop: 'imageinfo',
  iiprop: 'url|size|mime|extmetadata',
  iiurlwidth: String(THUMB_WIDTH),
  iiextmetadatalanguage: 'en',
  iiextmetadatafilter:
    'ObjectName|ImageDescription|Artist|Attribution|LicenseShortName|LicenseUrl|License|NonFree',
};

export type PagesReply =
  { status: 'ok'; pages: unknown[] } | { status: 'missing' } | { status: 'failed'; reason: string };

/** An Action API query for files, with `FILE_DETAILS` added. No `query` key means no files. */
export async function filePages(
  api: string,
  params: Record<string, string>,
  context: ProviderContext,
): Promise<PagesReply> {
  const query = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    ...params,
    ...FILE_DETAILS,
  });
  const reply = await getJson(`${api}?${query.toString()}`, context);
  if (reply.status !== 'ok') return reply;
  const { body } = reply;
  // The Action API reports errors with a 200 (IMG-4).
  if (!isRecord(body) || 'error' in body) return { status: 'failed', reason: 'API error' };
  if (body.query === undefined) return { status: 'ok', pages: [] };
  if (!isRecord(body.query) || !Array.isArray(body.query.pages))
    return { status: 'failed', reason: 'unexpected response' };
  return { status: 'ok', pages: body.query.pages };
}

/** `License` codes we know how to credit in one line (IMG-6). */
const FREE_LICENCE = /^(?:pd|cc0|cc-by(?:-sa)?-\d+(?:\.\d+)?(?:-[a-z]+)?)$/;
const STILL_IMAGES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/svg+xml',
  'image/webp',
]);
const MIN_SIDE = 100;
const MAX_ALT_LENGTH = 150;

/** Plain text from extmetadata HTML, without styles or hidden duplicates (IMG-7). */
function plain(html: string | undefined): string {
  if (html === undefined) return '';
  return htmlToText(
    html
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<(\w+)\b[^>]*display:\s*none[^>]*>[\s\S]*?<\/\1>/gi, ''),
  );
}

/** The URL on `upload.wikimedia.org`, without its query, if it's a Wikimedia file (IMG-9). */
function onUpload(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || !URL.canParse(raw)) return undefined;
  const url = new URL(raw);
  const host = url.hostname === 'upload.wikimedia.org' || url.hostname === 'thumb.wikimedia.org';
  if (url.protocol !== 'https:' || !host || !url.pathname.startsWith('/wikipedia/'))
    return undefined;
  return `https://upload.wikimedia.org${url.pathname}`;
}

/** At most 150 characters, cut at a word (IMG-11). */
function shorten(text: string): string {
  if (text.length <= MAX_ALT_LENGTH) return text;
  const room = text.slice(0, MAX_ALT_LENGTH);
  const space = room.lastIndexOf(' ');
  return `${(space > 0 ? room.slice(0, space) : room.slice(0, MAX_ALT_LENGTH - 1)).trimEnd()}…`;
}

export function toLookupImage(page: unknown, caption?: string): LookupImage | undefined {
  if (!isRecord(page) || typeof page.title !== 'string' || !Array.isArray(page.imageinfo))
    return undefined;
  const info: unknown = page.imageinfo[0];
  if (!isRecord(info) || !isRecord(info.extmetadata)) return undefined;
  const { width, height, mime, descriptionurl, extmetadata } = info;
  if (typeof width !== 'number' || typeof height !== 'number') return undefined;
  if (typeof mime !== 'string' || typeof descriptionurl !== 'string') return undefined;
  const field = (name: string) => {
    const entry = extmetadata[name];
    return isRecord(entry) && typeof entry.value === 'string' ? entry.value : undefined;
  };

  const licence = field('LicenseShortName');
  if (!FREE_LICENCE.test(field('License') ?? '') || field('NonFree') === 'true') return undefined;
  if (licence === undefined) return undefined;
  const author = plain(field('Attribution')) || plain(field('Artist'));
  if (author === '') return undefined;
  if (!STILL_IMAGES.has(mime) || Math.min(width, height) < MIN_SIDE) return undefined;
  const original = onUpload(info.url);
  const thumbUrl = onUpload(info.thumburl);
  if (original === undefined || thumbUrl === undefined) return undefined;

  const scaled = mime === 'image/svg+xml' || width > FULL_WIDTH;
  const fullUrl = scaled
    ? thumbUrl.replace(
        new RegExp(`/${String(THUMB_WIDTH)}px-([^/]*)$`),
        `/${String(FULL_WIDTH)}px-$1`,
      )
    : original;
  const title =
    plain(field('ObjectName')) || page.title.replace(/^File:/, '').replace(/\.[^.]+$/, '');
  const licenceUrl = field('LicenseUrl');
  const commons = URL.canParse(descriptionurl)
    ? new URL(descriptionurl).hostname === 'commons.wikimedia.org'
    : false;
  return {
    thumbUrl,
    fullUrl,
    alt: shorten(caption?.trim() || plain(field('ImageDescription')) || title),
    title,
    mime,
    width,
    height,
    attribution: {
      author,
      licence,
      ...(licenceUrl === undefined ? {} : { licenceUrl }),
      sourceName: commons ? 'Wikimedia Commons' : 'Wikipedia',
      sourceUrl: descriptionurl,
    },
  };
}
