// Lookup images for Playwright: sample `LookupImage`s, and a stand-in for upload.wikimedia.org so
// tests never download real images. A request the CSP blocks never reaches the route, so an image
// that arrives also proves the CSP allows it (image-grid.md, GRID-9).
import type { Page } from '@playwright/test';
import type { LookupImage } from '@litsnap/shared';

/** A 1 × 1 PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

export const sampleImage = (name: string, width = 1000, height = 800): LookupImage => ({
  thumbUrl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${name}.jpg/330px-${name}.jpg`,
  fullUrl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${name}.jpg/1280px-${name}.jpg`,
  alt: `A photo of the ${name.toLowerCase()}`,
  title: name,
  mime: 'image/jpeg',
  width,
  height,
  attribution: {
    author: 'Sample Author',
    licence: 'CC BY-SA 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
    sourceName: 'Wikimedia Commons',
    sourceUrl: `https://commons.wikimedia.org/wiki/File:${name}.jpg`,
  },
});

/**
 * Answers image downloads with a PNG, except URLs containing `hold`, which never answer. Returns
 * what was asked, with each request's headers.
 */
export async function fakeWikimedia(page: Page, hold?: string) {
  const asked: { url: string; headers: Record<string, string> }[] = [];
  await page.route('https://upload.wikimedia.org/**', async (route) => {
    const request = route.request();
    asked.push({ url: request.url(), headers: await request.allHeaders() });
    if (hold && request.url().includes(hold)) return;
    await route.fulfill({
      status: 200,
      body: PNG,
      contentType: 'image/png',
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  });
  return asked;
}
