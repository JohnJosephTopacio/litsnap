// Acceptance criteria IMG-6…11 from docs/features/image-providers.md: which files may be shown, and how.
import { describe, expect, it } from 'vitest';
import { toLookupImage } from '../../src/images/files';
import { filePage, missingPage, withInfo } from '../fixtures/images';

const PHOTO = 'File:Corner house.jpg';

describe('IMG-6: free licences only', () => {
  it.fails.each([
    ['pd', 'Public domain'],
    ['cc0', 'CC0'],
    ['cc-by-2.5', 'CC BY 2.5'],
    ['cc-by-4.0', 'CC BY 4.0'],
    ['cc-by-sa-3.0', 'CC BY-SA 3.0'],
    ['cc-by-sa-3.0-de', 'CC BY-SA 3.0 de'],
  ])('%s can be shown', (License, LicenseShortName) => {
    const page = filePage({ title: PHOTO, meta: { License, LicenseShortName } });

    expect(toLookupImage(page)?.attribution.licence).toBe(LicenseShortName);
  });

  it.fails.each([
    ['gfdl', { License: 'gfdl', LicenseShortName: 'GFDL' }],
    ['fair use', { License: 'fair use', LicenseShortName: 'Fair use', LicenseUrl: undefined }],
    ['no licence code', { License: undefined }],
    ['a look-alike code', { License: 'cc-by-nc-sa-4.0' }],
    ['NonFree, whatever the code says', { NonFree: 'true' }],
  ])('%s is not shown', (_name, meta) => {
    expect(toLookupImage(filePage({ title: PHOTO, meta }))).toBeUndefined();
  });

  it.fails('a missing file is not shown', () => {
    expect(toLookupImage(missingPage(PHOTO))).toBeUndefined();
  });
});

describe('IMG-7: always credited', () => {
  it.fails('prefers the credit line the author asked for, as plain text', () => {
    const page = filePage({
      title: PHOTO,
      meta: { Attribution: 'Photo &amp; text: <b>Ana Ruiz</b>', Artist: 'someone else' },
    });

    expect(toLookupImage(page)?.attribution.author).toBe('Photo & text: Ana Ruiz');
  });

  it.fails('falls back to the artist when the credit line is missing or empty', () => {
    const page = filePage({ title: PHOTO, meta: { Attribution: ' ' } });

    expect(toLookupImage(page)?.attribution.author).toBe('Sample Author');
  });

  it.fails('drops styles and hidden duplicates with their content', () => {
    const page = filePage({
      title: PHOTO,
      meta: {
        Artist:
          '<style data-mw-deduplicate="TemplateStyles:r1">.box{margin:0}</style>Unknown author' +
          '<span style="display: none;">Unknown author</span>',
      },
    });

    expect(toLookupImage(page)?.attribution.author).toBe('Unknown author');
  });

  it.fails.each([
    ['neither field', { Artist: undefined }],
    ['only markup', { Artist: '<span></span>' }],
  ])('with %s, the file is not shown', (_name, meta) => {
    expect(toLookupImage(filePage({ title: PHOTO, meta }))).toBeUndefined();
  });
});

describe("IMG-8: still images that aren't icons", () => {
  it.fails.each(['image/jpeg', 'image/png', 'image/gif', 'image/svg+xml', 'image/webp'])(
    '%s can be shown',
    (mime) => {
      expect(toLookupImage(filePage({ title: PHOTO, mime }))?.mime).toBe(mime);
    },
  );

  it.fails.each(['video/webm', 'audio/ogg', 'application/pdf', 'image/tiff', 'image/vnd.djvu'])(
    '%s is not shown',
    (mime) => {
      expect(toLookupImage(filePage({ title: PHOTO, mime }))).toBeUndefined();
    },
  );

  it.fails('a file whose shorter side is under 100 pixels is not shown', () => {
    const icon = filePage({
      title: 'File:Generic icon.svg',
      mime: 'image/svg+xml',
      width: 48,
      height: 48,
    });
    const strip = filePage({ title: 'File:Thin strip.png', width: 2000, height: 99 });

    expect(toLookupImage(icon)).toBeUndefined();
    expect(toLookupImage(strip)).toBeUndefined();
  });

  it.fails('100 pixels is enough', () => {
    const page = filePage({ title: 'File:Small square.png', width: 100, height: 100 });

    expect(toLookupImage(page)).toBeDefined();
  });
});

describe('IMG-9: image URLs on upload.wikimedia.org', () => {
  const COMMONS = 'https://upload.wikimedia.org/wikipedia/commons';

  it.fails('a large photo: both sizes are thumbnails, without tracking queries', () => {
    const image = toLookupImage(filePage({ title: PHOTO, width: 4000, height: 3000 }));

    expect(image).toMatchObject({
      thumbUrl: `${COMMONS}/thumb/a/ab/Corner_house.jpg/330px-Corner_house.jpg`,
      fullUrl: `${COMMONS}/thumb/a/ab/Corner_house.jpg/1280px-Corner_house.jpg`,
      width: 4000,
      height: 3000,
      mime: 'image/jpeg',
    });
  });

  it.fails('a photo no wider than 1280 pixels is enlarged to its original', () => {
    const image = toLookupImage(filePage({ title: PHOTO, width: 1280, height: 960 }));

    expect(image?.thumbUrl).toBe(`${COMMONS}/thumb/a/ab/Corner_house.jpg/330px-Corner_house.jpg`);
    expect(image?.fullUrl).toBe(`${COMMONS}/a/ab/Corner_house.jpg`);
  });

  it.fails('a photo narrower than 330 pixels is its original at both sizes', () => {
    const image = toLookupImage(
      filePage({ title: 'File:Tiny.gif', mime: 'image/gif', width: 282, height: 168 }),
    );

    expect(image?.thumbUrl).toBe(`${COMMONS}/a/ab/Tiny.gif`);
    expect(image?.fullUrl).toBe(`${COMMONS}/a/ab/Tiny.gif`);
  });

  it.fails('an SVG is a PNG at both sizes, however small it is', () => {
    const page = filePage({
      title: 'File:Roof plan.svg',
      mime: 'image/svg+xml',
      width: 342,
      height: 260,
    });

    expect(toLookupImage(page)).toMatchObject({
      thumbUrl: `${COMMONS}/thumb/a/ab/Roof_plan.svg/330px-Roof_plan.svg.png`,
      fullUrl: `${COMMONS}/thumb/a/ab/Roof_plan.svg/1280px-Roof_plan.svg.png`,
    });
  });

  it.fails('percent-encoding in the file name is kept', () => {
    const image = toLookupImage(filePage({ title: 'File:Café roof.jpg' }));

    expect(image?.thumbUrl).toBe(
      `${COMMONS}/thumb/a/ab/Caf%C3%A9_roof.jpg/330px-Caf%C3%A9_roof.jpg`,
    );
  });

  it.fails.each([
    ['another host', 'https://example.org/wikipedia/commons/a/ab/Corner_house.jpg'],
    ['not under /wikipedia/', 'https://upload.wikimedia.org/other/a/ab/Corner_house.jpg'],
    ['plain http', 'http://upload.wikimedia.org/wikipedia/commons/a/ab/Corner_house.jpg'],
  ])('a thumbnail on %s is not shown', (_name, thumburl) => {
    const page = withInfo(filePage({ title: PHOTO }), { thumburl });

    expect(toLookupImage(page)).toBeUndefined();
  });

  it.fails('an original elsewhere is not shown', () => {
    const page = withInfo(filePage({ title: PHOTO, width: 1000, height: 800 }), {
      url: 'https://example.org/Corner_house.jpg',
    });

    expect(toLookupImage(page)).toBeUndefined();
  });
});

describe('IMG-10: attribution', () => {
  it.fails('a Commons file', () => {
    expect(toLookupImage(filePage({ title: PHOTO }))?.attribution).toStrictEqual({
      author: 'Sample Author',
      licence: 'CC BY-SA 4.0',
      licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
      sourceName: 'Wikimedia Commons',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Corner_house.jpg',
    });
  });

  it.fails('a Wikipedia file, with no licence URL', () => {
    const page = filePage({
      title: 'File:Plain icon.png',
      wiki: 'en',
      meta: { License: 'pd', LicenseShortName: 'Public domain', LicenseUrl: undefined },
    });

    expect(toLookupImage(page)?.attribution).toStrictEqual({
      author: 'Sample Author',
      licence: 'Public domain',
      sourceName: 'Wikipedia',
      sourceUrl: 'https://en.wikipedia.org/wiki/File:Plain_icon.png',
    });
  });

  it.fails('a file with no licence name is not shown', () => {
    const page = filePage({ title: PHOTO, meta: { LicenseShortName: undefined } });

    expect(toLookupImage(page)).toBeUndefined();
  });
});

describe('IMG-11: title and alt text', () => {
  it.fails('the title is the plain text of ObjectName', () => {
    const page = filePage({
      title: PHOTO,
      meta: { ObjectName: '<div class="fn">\nA corner house</div>' },
    });

    expect(toLookupImage(page)?.title).toBe('A corner house');
  });

  it.fails('without ObjectName, the title is the file name without its extension', () => {
    const page = filePage({
      title: 'File:Corner house, 1902.JPG',
      meta: { ObjectName: undefined },
    });

    expect(toLookupImage(page)?.title).toBe('Corner house, 1902');
  });

  it.fails("the alt text is the article's caption first", () => {
    const image = toLookupImage(filePage({ title: PHOTO }), 'A house with a hipped roof');

    expect(image?.alt).toBe('A house with a hipped roof');
  });

  it.fails('then the description, as plain text', () => {
    expect(toLookupImage(filePage({ title: PHOTO }), '')?.alt).toBe(
      'A house whose roof slopes down on four sides',
    );
  });

  it.fails('then the title', () => {
    const page = filePage({ title: PHOTO, meta: { ImageDescription: '<p> </p>' } });

    expect(toLookupImage(page)?.alt).toBe('Corner house');
  });

  it.fails('a long alt text is cut at a word, with an ellipsis, 150 characters in all', () => {
    const caption = `${'word '.repeat(29)}wordy and more`; // 29 × 5 = 145 characters, then "wordy"

    const alt = toLookupImage(filePage({ title: PHOTO }), caption)?.alt;

    expect(alt).toBe(`${'word '.repeat(29).trimEnd()}…`);
    expect(alt?.length).toBeLessThanOrEqual(150);
  });

  it.fails('150 characters fit without an ellipsis', () => {
    const caption = 'x'.repeat(150);

    expect(toLookupImage(filePage({ title: PHOTO }), caption)?.alt).toBe(caption);
  });
});
