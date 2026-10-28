// GRID-1…3, 5 and 9 from docs/features/image-grid.md, against `vite preview` (the production build
// and CSP). The Worker is faked by `fakeWorker`, and Wikimedia by `fakeWikimedia` (e2e/images.ts).
import { expect, test, type Page } from '@playwright/test';
import { dragSelect, lookupMenu, lookupModal, openLookupBook } from './selection';
import { fakeWikimedia, sampleImage } from './images';
import { fakeWorker } from './worker';

const IMAGES = [sampleImage('Barn'), sampleImage('Mill'), sampleImage('Tower', 300, 900)];

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
    await lookupModal(page).getByRole('button', { name: size, exact: true }).click();
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
