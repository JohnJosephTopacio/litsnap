// Fixed-layout books: RD-27 and RD-28 from docs/features/epub-reader.md (issue #17).
import { expect, test } from '@playwright/test';
import { bookFrame } from './book';
import { FIXED_TITLE, fixedLayoutEpub } from './fixtures';

// The page's own colours, from its stylesheet: they must never be replaced by a theme.
const PAGE_BACKGROUND = 'rgb(255, 238, 204)';
const PAGE_TEXT = 'rgb(136, 0, 0)';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(fixedLayoutEpub());
});

test('RD-27: a fixed-layout book opens and renders, with its title and no error', async ({
  page,
}) => {
  await expect(page.getByRole('heading', { level: 1, name: FIXED_TITLE })).toBeVisible();
  await bookFrame(page, 'A fixed page.');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('RD-28: text size and layout are disabled; the theme leaves the pages alone', async ({
  page,
}) => {
  const frame = await bookFrame(page, 'A fixed page.');
  await page.getByRole('button', { name: 'Settings' }).click();
  const settings = page.getByRole('region', { name: 'Reader settings' });

  await expect(settings).toContainText('This book has a fixed page layout');
  for (const name of ['Smaller text', 'Larger text', 'Paginated', 'Scrolled']) {
    await expect(settings.getByRole('button', { name })).toBeDisabled();
  }

  await settings.getByRole('button', { name: 'Dark' }).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  const pageStyle = await frame
    .locator('body')
    .evaluate((body) => [getComputedStyle(body).backgroundColor, getComputedStyle(body).color]);
  expect(pageStyle).toEqual([PAGE_BACKGROUND, PAGE_TEXT]);
});
