// VIEW-2, 3, 5 and 7 from docs/features/image-viewer.md, against `vite preview` (the production
// build, the real <dialog> and its Esc). The Worker and Wikimedia are faked.
import { expect, test, type Frame, type Page } from '@playwright/test';
import { fakeWikimedia, sampleImage } from './images';
import { dragSelect, lookupMenu, lookupModal, openJekyll, openLookupBook } from './selection';
import { fakeWorker } from './worker';

const IMAGES = [sampleImage('Barn'), sampleImage('Mill'), sampleImage('Hut')];

const bottomBar = (page: Page) => page.getByRole('contentinfo', { name: 'Reading progress' });
const images = (page: Page) => lookupModal(page).getByRole('region', { name: 'Images' });
const enlarged = (page: Page) => lookupModal(page).getByRole('group', { name: 'Enlarged image' });

async function lookUpImages(page: Page, frame: Frame, first: string, last: string) {
  await dragSelect(page, frame, first, last);
  await lookupMenu(page).getByRole('menuitem', { name: 'Image' }).click();
  await expect(images(page).getByRole('button', { name: /^Enlarge: / })).toHaveCount(3);
}

test.beforeEach(async ({ page }) => {
  await fakeWorker(page, () => ({
    body: { term: 'x', images: { status: 'found', images: IMAGES } },
  }));
});

test('VIEW-2, VIEW-3: the large image, with focus on Back, which returns to the grid', async ({
  page,
}) => {
  const asked = await fakeWikimedia(page);
  await lookUpImages(page, await openLookupBook(page), 'hipped', 'roof');
  const thumbnail = await images(page).locator('.image-frame').first().boundingBox();

  await images(page).getByRole('button', { name: 'Enlarge: A photo of the mill' }).click();

  await expect(enlarged(page)).toContainText('2 of 3');
  await expect(enlarged(page)).toContainText('Mill · by Sample Author · CC BY-SA 4.0');
  await expect(enlarged(page).getByRole('img')).toHaveAttribute('src', /^blob:/);
  await expect.poll(() => asked.map(({ url }) => url)).toContain(IMAGES[1]?.fullUrl);
  const large = await enlarged(page).locator('.viewer-frame').boundingBox();
  expect(large && thumbnail && large.width > thumbnail.width).toBe(true);
  expect(large && large.width / large.height).toBeCloseTo(1000 / 800, 1);
  // As large as fits: within the frame's 55vh, not just the modal's width.
  expect(large && large.height).toBeLessThanOrEqual((page.viewportSize()?.height ?? 0) * 0.55 + 1);
  const back = enlarged(page).getByRole('button', { name: '← Back to images' });
  await expect(back).toBeFocused();

  await page.keyboard.press('Enter');

  await expect(
    images(page).getByRole('button', { name: 'Enlarge: A photo of the mill' }),
  ).toBeFocused();
});

test('VIEW-5: Esc goes back to the grid, and a second Esc closes the modal', async ({ page }) => {
  await fakeWikimedia(page);
  await lookUpImages(page, await openLookupBook(page), 'hipped', 'roof');
  await images(page).getByRole('button', { name: 'Enlarge: A photo of the barn' }).click();
  await expect(enlarged(page)).toBeVisible();

  await page.keyboard.press('Escape');

  await expect(enlarged(page)).toBeHidden();
  await expect(images(page).getByRole('list')).toBeVisible();
  await expect(lookupModal(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(lookupModal(page)).toBeHidden();
});

test('VIEW-7: ← and → step through the images, and the book stays put', async ({ page }) => {
  await fakeWikimedia(page);
  await lookUpImages(page, await openJekyll(page), 'rugged', 'countenance');
  const progress = await bottomBar(page).textContent();
  await images(page).getByRole('button', { name: 'Enlarge: A photo of the barn' }).click();

  await page.keyboard.press('ArrowRight');
  await expect(enlarged(page)).toContainText('2 of 3');
  await page.keyboard.press('ArrowRight');
  await expect(enlarged(page)).toContainText('3 of 3');
  await page.keyboard.press('ArrowLeft');
  await expect(enlarged(page)).toContainText('2 of 3');
  await page.waitForTimeout(750);

  await expect(bottomBar(page)).toHaveText(progress ?? '');
});
