// The image fixtures have the shape of the real responses they copy (recorded 2026-10-27), so the
// red tests fail because the code is missing, not because a fixture is wrong.
import { describe, expect, it } from 'vitest';
import { claims, filePage, mediaItem } from './images';

const info = (page: ReturnType<typeof filePage>) => page.imageinfo[0];

describe('filePage', () => {
  it('scales a large file to a 330 px thumbnail on thumb.wikimedia.org, as the API does', () => {
    const page = filePage({ title: 'File:Corner house.jpg', width: 4000, height: 3000 });

    expect(info(page)).toMatchObject({
      thumburl:
        'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Corner_house.jpg/330px-Corner_house.jpg' +
        '?utm_source=en.wikipedia.org&utm_campaign=imageinfo&utm_content=thumbnail',
      thumbwidth: 330,
      thumbheight: 248,
      url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Corner_house.jpg?utm_source=en.wikipedia.org&utm_campaign=imageinfo&utm_content=original',
      descriptionurl: 'https://commons.wikimedia.org/wiki/File:Corner_house.jpg',
    });
  });

  it('gives the original as the thumbnail when the file is no wider than 330 px', () => {
    const page = filePage({ title: 'File:Tiny.gif', mime: 'image/gif', width: 282, height: 168 });

    expect(info(page)?.thumburl).toBe(
      'https://upload.wikimedia.org/wikipedia/commons/a/ab/Tiny.gif?utm_source=en.wikipedia.org&utm_campaign=imageinfo&utm_content=original',
    );
  });

  it('scales an SVG to PNG, however small', () => {
    const page = filePage({ title: 'File:Plan.svg', mime: 'image/svg+xml', width: 48, height: 48 });

    expect(info(page)?.thumburl).toMatch(/\/thumb\/a\/ab\/Plan\.svg\/330px-Plan\.svg\.png\?/);
  });

  it('puts Wikipedia files under /wikipedia/en/ with an en.wikipedia.org page', () => {
    expect(info(filePage({ title: 'File:Icon.png', wiki: 'en' }))).toMatchObject({
      url: expect.stringMatching(/^https:\/\/upload\.wikimedia\.org\/wikipedia\/en\//) as unknown,
      descriptionurl: 'https://en.wikipedia.org/wiki/File:Icon.png',
    });
  });

  it('wraps extmetadata values, overrides and removes fields, and names the object', () => {
    const meta = info(
      filePage({ title: 'File:Corner house.jpg', meta: { Artist: undefined, License: 'pd' } }),
    )?.extmetadata;

    expect(meta?.License).toEqual({ value: 'pd', source: 'commons-desc-page' });
    expect(meta?.ObjectName?.value).toBe('Corner house');
    expect(meta).not.toHaveProperty('Artist');
    expect(meta?.LicenseShortName?.value).toBe('CC BY-SA 4.0');
  });
});

describe('mediaItem', () => {
  it('is a gallery image unless told otherwise, with a caption only when given', () => {
    expect(mediaItem('File:A.jpg')).toMatchObject({ type: 'image', showInGallery: true });
    expect(mediaItem('File:A.jpg')).not.toHaveProperty('caption');
    expect(mediaItem('File:A.jpg', { showInGallery: false })).not.toHaveProperty('showInGallery');
    expect(mediaItem('File:A.jpg', { caption: 'Hi' }).caption).toEqual({
      html: '<i>Hi</i>',
      text: 'Hi',
    });
  });
});

describe('claims', () => {
  it('answers like wbgetclaims, with no P373 key when there is no claim', () => {
    expect(claims()).toEqual({ claims: {} });
    expect(claims('Hipped roofs').claims.P373?.[0]?.mainsnak.datavalue.value).toBe('Hipped roofs');
  });
});
