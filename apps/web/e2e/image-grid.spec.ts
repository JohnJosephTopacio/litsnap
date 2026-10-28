// GRID-1…3, 5 and 9 from docs/features/image-grid.md, against `vite preview` (the production build
// and CSP). The Worker is faked by `fakeWorker`, and Wikimedia by `fakeWikimedia` below: a request
// the CSP blocks never reaches a route, so an image that arrives also proves the CSP allows it.
import { expect, test, type Page } from '@playwright/test';
import type { LookupImage } from '@litsnap/shared';
import { dragSelect, lookupMenu, lookupModal, openLookupBook } from './selection';
import { fakeWorker } from './worker';

/** A 1 × 1 PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const image = (name: string, width = 1000, height = 800): LookupImage => ({
  thumbUrl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${name}.jpg/330px-${name}.jpg`,
  fullUrl: `https://upload.wikimedia.org/wikipedia/commons/a/ab/${name}.jpg`,
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

const IMAGES = [image('Barn'), image('Mill'), image('Tower', 300, 900)];

/** Answers image downloads with a PNG, except URLs containing `hold`, which never answer. */
async function fakeWikimedia(page: Page, hold?: string) {
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

/** Collects CSP violations and page errors. */
function watchViolations(page: Page) {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (message.text().includes('Content Security Policy')) violations.push(message.text());
  });
  page.on('pageerror', (error) => violations.push(error.message));
  return violations;
}

async function lookUpImages(page: Page) {
  await fakeWorker(page, () => ({
    body: { term: 'hipped roof', images: { status: 'found', images: IMAGES } },
  }));
  const frame = await openLookupBook(page);
  await dragSelect(page, frame, 'hipped', 'roof');
  await lookupMenu(page).getByRole('menuitem', { name: 'Image' }).click();
  return lookupModal(page).getByRole('region', { name: 'Images' });
}

test('GRID-9, GRID-2: images arrive from Wikimedia through our code, as blob: URLs', async ({
  page,
}) => {
  const violations = watchViolations(page);
  const asked = await fakeWikimedia(page);

  const section = await lookUpImages(page);

  const thumbnails = section.getByRole('img');
  await expect(thumbnails).toHaveCount(3);
  for (const thumbnail of await thumbnails.all()) {
    await expect(thumbnail).toHaveAttribute('src', /^blob:/);
    await expect
      .poll(() => thumbnail.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBe(1);
  }
  expect(asked.map(({ url }) => url)).toEqual(IMAGES.map(({ thumbUrl }) => thumbUrl));
  for (const { headers } of asked) {
    expect(headers).not.toHaveProperty('referer');
    expect(headers).not.toHaveProperty('cookie');
  }
  expect(violations).toEqual([]);
});

test('GRID-1: 3 columns at M and L, 2 at S', async ({ page }) => {
  await fakeWikimedia(page);
  const section = await lookUpImages(page);
  const columns = () =>
    section
      .getByRole('list')
      .evaluate((list) => getComputedStyle(list).gridTemplateColumns.split(' ').length);
  await expect(section.getByRole('img')).toHaveCount(3);

  for (const [size, expected] of [
    ['Medium', 3],
    ['Large', 3],
    ['Small', 2],
  ] as const) {
    await lookupModal(page).getByRole('button', { name: size }).click();
    await expect.poll(columns).toBe(expected);
  }
});

test("GRID-3: a thumbnail still downloading holds its place, at the image's aspect ratio", async ({
  page,
}) => {
  await fakeWikimedia(page, 'Tower');
  const section = await lookUpImages(page);
  await expect(section.getByRole('img')).toHaveCount(2);

  const tower = section.getByRole('listitem').nth(2).locator('.image-frame');
  const box = await tower.boundingBox();
  expect(box && box.width / box.height).toBeCloseTo(300 / 900, 1);
});

test('GRID-5: each thumbnail is credited, with links that open in new tabs', async ({ page }) => {
  await fakeWikimedia(page);
  const section = await lookUpImages(page);

  const barn = section.getByRole('listitem').first();
  await expect(barn).toContainText('Sample Author · CC BY-SA 4.0');
  await expect(barn.getByRole('link', { name: 'Sample Author' })).toHaveAttribute(
    'href',
    'https://commons.wikimedia.org/wiki/File:Barn.jpg',
  );
  await expect(barn.getByRole('link', { name: 'CC BY-SA 4.0' })).toHaveAttribute(
    'target',
    '_blank',
  );
});
