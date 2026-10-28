// Acceptance criteria IMG-1…4 from docs/features/image-providers.md: rules every request follows.
import { describe, expect, it } from 'vitest';
import type { ProviderContext } from '../../src/definitions/types';
import { findArticle } from '../../src/images/article';
import { lookupImages } from '../../src/images/chain';
import { commonsImages } from '../../src/images/commonsImages';
import { wikipediaImages } from '../../src/images/wikipediaImages';
import { fakeFetch, hang, json, networkError, status, text, type Reply } from '../fakeFetch';
import {
  API_ERROR,
  categoryUrl,
  claims,
  detailsUrl,
  HIP_ROOF,
  MEDIA_LIST,
  mediaItem,
  mediaList,
  SUMMARY,
  wikidataUrl,
} from '../fixtures/images';

const LIST_URL = `${MEDIA_LIST}Hip_roof`;
const DETAILS_URL = detailsUrl(['File:Front view.jpg']);
const WIKIDATA_URL = wikidataUrl('Q162034');
const CATEGORY_URL = categoryUrl('Hipped roofs');

interface Step {
  /** Runs the step, with the requests before it answered well. */
  run: (context: ProviderContext) => Promise<{ status: string }>;
  /** The earlier requests' routes. */
  before: Record<string, Reply>;
  url: string;
  /** A 200 body that isn't the shape the step expects. */
  wrongShape: unknown;
  /** The Action API reports errors with a 200 (IMG-4). */
  actionApi: boolean;
  /** A file-details request, which gets `detailsTimeoutMs` (IMG-3). */
  details?: boolean;
}

const STEPS: [string, Step][] = [
  [
    'the article',
    {
      run: (context) => findArticle('hipped roof', context),
      before: {},
      url: `${SUMMARY}hipped_roof`,
      wrongShape: { type: 'standard' },
      actionApi: false,
    },
  ],
  [
    "the article's images",
    {
      run: (context) => wikipediaImages.images(HIP_ROOF, context),
      before: {},
      url: LIST_URL,
      wrongShape: { items: 'none' },
      actionApi: false,
    },
  ],
  [
    'file details',
    {
      run: (context) => wikipediaImages.images(HIP_ROOF, context),
      before: { [LIST_URL]: json(mediaList([mediaItem('File:Front_view.jpg')])) },
      url: DETAILS_URL,
      wrongShape: { query: { pages: 'none' } },
      actionApi: true,
      details: true,
    },
  ],
  [
    'the Commons category',
    {
      run: (context) => commonsImages.images(HIP_ROOF, context),
      before: {},
      url: WIKIDATA_URL,
      wrongShape: { claims: 'none' },
      actionApi: true,
    },
  ],
  [
    "the category's files",
    {
      run: (context) => commonsImages.images(HIP_ROOF, context),
      before: { [WIKIDATA_URL]: json(claims('Hipped roofs')) },
      url: CATEGORY_URL,
      wrongShape: { query: { pages: 'none' } },
      actionApi: true,
      details: true,
    },
  ],
];

function run(step: Step, reply: Reply, timeoutMs = 1000, detailsTimeoutMs?: number) {
  const fake = fakeFetch({ ...step.before, [step.url]: reply });
  const context: ProviderContext = { fetch: fake.fetch, timeoutMs };
  if (detailsTimeoutMs !== undefined) context.detailsTimeoutMs = detailsTimeoutMs;
  return { fake, outcome: step.run(context) };
}

const wait = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

describe.each(STEPS)('%s', (_name, step) => {
  describe('IMG-1: never throws', () => {
    it('a network error is a failure', async () => {
      expect(await run(step, networkError).outcome).toMatchObject({ status: 'failed' });
    });
  });

  describe('IMG-2: requests identify us', () => {
    it('every request sends our User-Agent and asks for JSON, at the documented URL', async () => {
      const { fake, outcome } = run(step, status(404));
      await outcome;

      expect(fake.urls()).toEqual([...Object.keys(step.before), step.url]);
      for (const request of fake.requests) {
        expect(request.headers.get('User-Agent')).toBe(
          'LitSnap/1.0 (https://github.com/JohnJosephTopacio/litsnap)',
        );
        expect(request.headers.get('Accept')).toBe('application/json');
      }
    });
  });

  describe('IMG-3: a slow source times out', () => {
    it('aborts the request and fails', async () => {
      const { fake, outcome } = run(step, hang, 20);

      expect(await outcome).toMatchObject({ status: 'failed' });
      expect(fake.requests.at(-1)?.signal?.aborted).toBe(true);
    });

    it(
      step.details
        ? 'waits detailsTimeoutMs, not timeoutMs: file details are slow'
        : 'waits timeoutMs, whatever detailsTimeoutMs is',
      async () => {
        const { fake, outcome } = run(step, hang, 20, 300);
        const failed = outcome.then(({ status }) => status);

        await wait(150);
        expect(fake.requests.at(-1)?.signal?.aborted).toBe(!step.details);
        expect(await failed).toBe('failed');
      },
    );
  });

  describe('IMG-4: HTTP statuses', () => {
    it('404 is not found', async () => {
      expect(await run(step, status(404)).outcome).toEqual({ status: 'not-found' });
    });

    it.each([429, 500, 503])('%i is a failure', async (code) => {
      expect(await run(step, status(code)).outcome).toMatchObject({ status: 'failed' });
    });

    it('a body that is not JSON is a failure', async () => {
      expect(await run(step, text('<html>Oops</html>')).outcome).toMatchObject({
        status: 'failed',
      });
    });

    it('JSON of the wrong shape is a failure', async () => {
      expect(await run(step, json(step.wrongShape)).outcome).toMatchObject({ status: 'failed' });
    });

    if (step.actionApi) {
      it('an Action API error is a failure', async () => {
        expect(await run(step, json(API_ERROR)).outcome).toMatchObject({ status: 'failed' });
      });
    } else {
      it('400 is an invalid title: not found', async () => {
        expect(await run(step, status(400)).outcome).toEqual({ status: 'not-found' });
      });
    }
  });
});

describe('IMG-1: the chain never throws', () => {
  it('a network error is a failure', async () => {
    const fake = fakeFetch({ [`${SUMMARY}hipped_roof`]: networkError });

    expect(await lookupImages('hipped roof', { fetch: fake.fetch, timeoutMs: 1000 })).toMatchObject(
      { status: 'failed' },
    );
  });
});

describe('IMG-2: the documented URLs, written out', () => {
  // The fixtures build these URLs; spelling two out pins the encoding the spec describes.
  it('file details', () => {
    expect(detailsUrl(['File:Front view.jpg', 'File:Café.svg'])).toBe(
      'https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2' +
        '&titles=File%3AFront+view.jpg%7CFile%3ACaf%C3%A9.svg&prop=imageinfo' +
        '&iiprop=url%7Csize%7Cmime%7Cextmetadata&iiurlwidth=330&iiextmetadatalanguage=en' +
        '&iiextmetadatafilter=ObjectName%7CImageDescription%7CArtist%7CAttribution' +
        '%7CLicenseShortName%7CLicenseUrl%7CLicense%7CNonFree',
    );
  });

  it("the category's files", () => {
    expect(categoryUrl('Hipped roofs')).toBe(
      'https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2' +
        '&generator=categorymembers&gcmtitle=Category%3AHipped+roofs&gcmtype=file&gcmlimit=10' +
        '&prop=imageinfo&iiprop=url%7Csize%7Cmime%7Cextmetadata&iiurlwidth=330' +
        '&iiextmetadatalanguage=en&iiextmetadatafilter=ObjectName%7CImageDescription%7CArtist' +
        '%7CAttribution%7CLicenseShortName%7CLicenseUrl%7CLicense%7CNonFree',
    );
  });

  it('titles in REST URLs are percent-encoded', async () => {
    const fake = fakeFetch({
      [`${SUMMARY}caf%C3%A9_au_lait`]: status(404),
      [`${MEDIA_LIST}Caf%C3%A9_au_lait`]: status(404),
    });
    const context = { fetch: fake.fetch, timeoutMs: 1000 };

    await findArticle('café au lait', context);
    await wikipediaImages.images({ title: 'Café au lait' }, context);

    expect(fake.urls()).toEqual([`${SUMMARY}caf%C3%A9_au_lait`, `${MEDIA_LIST}Caf%C3%A9_au_lait`]);
  });
});
