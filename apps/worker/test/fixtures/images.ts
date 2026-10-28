// Upstream responses for the image-provider tests. Each copies the structure of a real response
// (recorded 2026-10-27) with our own wording and file names, so no third-party text is committed.
import type { Article } from '../../src/images/types';

export const SUMMARY = 'https://en.wikipedia.org/api/rest_v1/page/summary/';
export const MEDIA_LIST = 'https://en.wikipedia.org/api/rest_v1/page/media-list/';
export const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';
export const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
export const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';

/** `FILE_DETAILS` as a query string, written out so the tests don't reuse the code's builder. */
const FILE_DETAILS_QUERY =
  'prop=imageinfo&iiprop=url%7Csize%7Cmime%7Cextmetadata&iiurlwidth=330&iiextmetadatalanguage=en' +
  '&iiextmetadatafilter=ObjectName%7CImageDescription%7CArtist%7CAttribution%7CLicenseShortName' +
  '%7CLicenseUrl%7CLicense%7CNonFree';

/** The details request for an article's files (IMG-2). `titles` as `File:A b.jpg`. */
export const detailsUrl = (titles: string[]) =>
  `${WIKIPEDIA_API}?action=query&format=json&formatversion=2&` +
  `${new URLSearchParams({ titles: titles.join('|') }).toString()}&${FILE_DETAILS_QUERY}`;

export const wikidataUrl = (id: string) =>
  `${WIKIDATA_API}?action=wbgetclaims&format=json&entity=${id}&property=P373`;

/** The category request (IMG-2). `category` without `Category:`. */
export const categoryUrl = (category: string) =>
  `${COMMONS_API}?action=query&format=json&formatversion=2&generator=categorymembers&` +
  new URLSearchParams({ gcmtitle: `Category:${category}` }).toString() +
  `&gcmtype=file&gcmlimit=10&${FILE_DETAILS_QUERY}`;

// --- The article -------------------------------------------------------------------------------

const summary = (type: string, title: string, wikibaseItem?: string) => ({
  type,
  title,
  displaytitle: `<span class="mw-page-title-main">${title}</span>`,
  titles: {
    canonical: title.replaceAll(' ', '_'),
    normalized: title,
    display: `<span class="mw-page-title-main">${title}</span>`,
  },
  pageid: 1234,
  ...(wikibaseItem === undefined ? {} : { wikibase_item: wikibaseItem }),
  extract: 'Our own short summary of the article.',
  content_urls: {
    desktop: { page: `https://en.wikipedia.org/wiki/${title.replaceAll(' ', '_')}` },
  },
});

/** What `summary/hipped_roof` answers: the redirect target's article. */
export const WP_HIP_ROOF = summary('standard', 'Hip roof', 'Q162034');
export const WP_NO_WIKIDATA = summary('standard', 'Roof plan');
export const WP_ODD_WIKIDATA = summary('standard', 'Roof plan', 'not-an-id');
export const WP_BASS = summary('disambiguation', 'Bass', 'Q1');
export const WP_NO_EXTRACT = summary('no-extract', 'Roof plan', 'Q2');

export const HIP_ROOF: Article = { title: 'Hip roof', wikidataId: 'Q162034' };

// --- File details ------------------------------------------------------------------------------

type Meta = Record<string, string | undefined>;

interface FileSpec {
  /** `File:Name.jpg`, with spaces. */
  title: string;
  mime?: string;
  width?: number;
  height?: number;
  /** Where the file lives: Commons, or English Wikipedia itself (non-free files, some icons). */
  wiki?: 'commons' | 'en';
  /** Replaces `extmetadata` fields; `undefined` removes one. */
  meta?: Meta;
}

const BY_SA_4: Meta = {
  ObjectName: undefined, // filled from the title below
  ImageDescription: 'A house whose roof slopes down on <a href="/wiki/Four">four</a> sides',
  Artist:
    '<a href="//commons.wikimedia.org/wiki/User:Sample" title="User:Sample">Sample Author</a>',
  LicenseShortName: 'CC BY-SA 4.0',
  LicenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
  License: 'cc-by-sa-4.0',
};

const UTM = (content: string) =>
  `?utm_source=en.wikipedia.org&utm_campaign=imageinfo&utm_content=${content}`;

/** One entry of an imageinfo response's `query.pages`, shaped like the real thing. */
export function filePage(spec: FileSpec) {
  const { title, mime = 'image/jpeg', width = 1332, height = 718, wiki = 'commons' } = spec;
  const name = encodeURIComponent(title.slice('File:'.length).replaceAll(' ', '_'));
  const original = `https://upload.wikimedia.org/wikipedia/${wiki}/a/ab/${name}`;
  const svg = mime === 'image/svg+xml';
  // The API scales SVGs to PNG, and gives the original when it's no wider than asked for.
  const scaled = svg || width > 330;
  const thumburl = scaled
    ? `https://thumb.wikimedia.org/wikipedia/${wiki}/thumb/a/ab/${name}/330px-${name}${svg ? '.png' : ''}${UTM('thumbnail')}`
    : original + UTM('original');
  const meta: Meta = { ...BY_SA_4, ObjectName: title.slice(5).replace(/\.\w+$/, ''), ...spec.meta };
  const extmetadata = Object.fromEntries(
    Object.entries(meta)
      .filter((entry): entry is [string, string] => entry[1] !== undefined)
      .map(([key, value]) => [key, { value, source: 'commons-desc-page' }]),
  );
  return {
    pageid: 1379433,
    ns: 6,
    title,
    imagerepository: wiki === 'commons' ? 'shared' : 'local',
    imageinfo: [
      {
        size: 378017,
        width,
        height,
        thumburl,
        thumbwidth: scaled ? 330 : width,
        thumbheight: scaled ? Math.round((height * 330) / width) : height,
        url: original + UTM('original'),
        descriptionurl:
          wiki === 'commons'
            ? `https://commons.wikimedia.org/wiki/File:${name}`
            : `https://en.wikipedia.org/wiki/File:${name}`,
        descriptionshorturl: 'https://commons.wikimedia.org/w/index.php?curid=1379433',
        mime,
        extmetadata,
      },
    ],
  };
}

/** `page` with some of its `imageinfo` fields replaced. */
export const withInfo = (
  page: ReturnType<typeof filePage>,
  patch: Partial<ReturnType<typeof filePage>['imageinfo'][number]>,
) => ({ ...page, imageinfo: page.imageinfo.map((info) => ({ ...info, ...patch })) });

/** A title that isn't a file any more. */
export const missingPage = (title: string) => ({ ns: 6, title, missing: true, known: false });

export const details = (pages: unknown[]) => ({ batchcomplete: true, query: { pages } });

/** How the Action API reports an error: with a 200 (IMG-4). */
export const API_ERROR = {
  error: { code: 'internal_api_error', info: 'Something went wrong.' },
  servedby: 'mw-api-ext.eqiad.main-1',
};

// --- The article's images ----------------------------------------------------------------------

interface ItemSpec {
  type?: string;
  showInGallery?: boolean;
  caption?: string;
  leadImage?: boolean;
}

/** One media-list item. `file` as the endpoint gives it, with underscores. */
export const mediaItem = (file: string, spec: ItemSpec = {}) => ({
  title: file,
  leadImage: spec.leadImage ?? false,
  section_id: 0,
  type: spec.type ?? 'image',
  ...(spec.caption === undefined
    ? {}
    : { caption: { html: `<i>${spec.caption}</i>`, text: spec.caption } }),
  ...(spec.showInGallery === false ? {} : { showInGallery: true }),
  srcset: [{ src: `//thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/${file}`, scale: '1x' }],
});

export const mediaList = (items: unknown[]) => ({ revision: '1365392545', tid: 'c141', items });

// --- The Commons category ----------------------------------------------------------------------

const claim = (value: string) => ({
  mainsnak: {
    snaktype: 'value',
    property: 'P373',
    datavalue: { value, type: 'string' },
    datatype: 'string',
  },
  type: 'statement',
  rank: 'normal',
});

/** What wbgetclaims answers: no `P373` key at all when there's no claim. */
export const claims = (
  ...categories: string[]
): { claims: { P373?: ReturnType<typeof claim>[] } } =>
  categories.length === 0 ? { claims: {} } : { claims: { P373: categories.map(claim) } };

export const category = (pages: unknown[]) => ({
  batchcomplete: true,
  continue: { gcmcontinue: 'file|2a|644023', continue: 'gcmcontinue||' },
  query: { pages },
});

/** What Commons answers for a category with no files: no `query` at all. */
export const EMPTY_CATEGORY = { batchcomplete: true };
