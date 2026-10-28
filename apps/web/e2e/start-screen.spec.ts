// The start screen: RD-30…33 from docs/features/epub-reader.md, and STO-16 end to end.
// Runs against `vite preview` with the production CSP.
import { expect, test, type Page } from '@playwright/test';
import { JEKYLL, JEKYLL_TITLE, SECOND_TITLE, secondEpub } from './fixtures';
import { stored, storedSetting } from './storage';

const bottomBar = (page: Page) => page.getByRole('contentinfo', { name: 'Reading progress' });
const bookHeading = (page: Page) => page.getByRole('heading', { level: 1, name: JEKYLL_TITLE });
const continueButton = (page: Page) => page.getByRole('button', { name: 'Continue reading' });
const themeGroup = (page: Page) => page.getByRole('group', { name: 'Theme' });

async function percent(page: Page): Promise<number> {
  const match = /(\d+)%/.exec((await bottomBar(page).textContent()) ?? '');
  return match?.[1] ? Number(match[1]) : -1;
}

/** Opens Jekyll and turns a few pages, so there's a position worth keeping. */
async function readSome(page: Page): Promise<number> {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(JEKYLL);
  await expect(bookHeading(page)).toBeVisible();
  await expect(bottomBar(page)).toContainText('%');
  await page.getByRole('button', { name: 'Contents' }).click();
  await page
    .getByRole('navigation', { name: 'Table of contents' })
    .getByText('Story of the Door')
    .click();
  const chapterStart = await percent(page);
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect.poll(() => percent(page)).toBeGreaterThan(chapterStart);
  return percent(page);
}

test('RD-30, RD-32: Home shows the start screen, and Continue reading returns to the same place', async ({
  page,
}) => {
  const before = await readSome(page);

  // At once, without waiting for the debounced save: Home must save the position itself.
  await page.getByRole('button', { name: 'Home', exact: true }).click();

  await expect(page.getByRole('button', { name: 'Open a book' })).toBeVisible();
  await expect(bookHeading(page)).toHaveCount(0);
  await expect(continueButton(page)).toHaveAccessibleDescription(JEKYLL_TITLE);
  expect((await stored(page)).current).toEqual({ title: JEKYLL_TITLE });

  await continueButton(page).click();

  await expect(bookHeading(page)).toBeVisible();
  await expect.poll(() => percent(page)).toBe(before);
});

test('RD-30: Home while the book is still opening goes home without breaking', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(JEKYLL);
  await expect(bottomBar(page)).toContainText('%');
  await page.reload();

  // The title shows before foliate has drawn the first page; leave at once.
  await expect(bookHeading(page)).toBeVisible();
  await page.getByRole('button', { name: 'Home', exact: true }).click();

  await expect(page.getByRole('button', { name: 'Open a book' })).toBeVisible();
  await expect(continueButton(page)).toBeVisible();
  expect(errors).toEqual([]);
});

test('RD-31: after going Home, a reload stays on the start screen until a book is opened again', async ({
  page,
}) => {
  await readSome(page);
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect.poll(() => storedSetting(page, 'leftAtStart')).toBe(true);

  await page.reload();

  await expect(continueButton(page)).toBeVisible();
  await expect(bookHeading(page)).toHaveCount(0);

  await continueButton(page).click();
  await expect(bookHeading(page)).toBeVisible();
  await expect.poll(() => storedSetting(page, 'leftAtStart')).toBe(false);

  await page.reload();

  // RD-8 again: straight into the book.
  await expect(bookHeading(page)).toBeVisible();

  // Opening a new file from the start screen counts as being back in a book too.
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect.poll(() => storedSetting(page, 'leftAtStart')).toBe(true);
  await page.locator('input[type="file"]').setInputFiles(secondEpub());
  await expect(page.getByRole('heading', { level: 1, name: SECOND_TITLE })).toBeVisible();
  await expect.poll(() => storedSetting(page, 'leftAtStart')).toBe(false);

  await page.reload();

  await expect(page.getByRole('heading', { level: 1, name: SECOND_TITLE })).toBeVisible();
});

test('RD-32: no Continue reading before any book was opened', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('button', { name: 'Open a book' })).toBeVisible();
  await expect(continueButton(page)).toHaveCount(0);
});

test.describe('with the OS in dark mode', () => {
  test.use({ colorScheme: 'dark' });

  test('RD-33: the start screen sets the same theme as Settings, and it survives a reload', async ({
    page,
  }) => {
    await page.goto('/');
    const light = themeGroup(page).getByRole('button', { name: 'Light' });
    const dark = themeGroup(page).getByRole('button', { name: 'Dark' });
    await expect(dark).toHaveAttribute('aria-pressed', 'true');
    await expect(light).toHaveAttribute('aria-pressed', 'false');

    await light.click();

    await expect(light).toHaveAttribute('aria-pressed', 'true');
    await expect(dark).toHaveAttribute('aria-pressed', 'false');
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
      .toBe('light');
    await expect.poll(() => storedSetting(page, 'theme')).toBe('light');

    await page.reload();
    await expect(themeGroup(page).getByRole('button', { name: 'Light' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await page.locator('input[type="file"]').setInputFiles(JEKYLL);
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(
      page.getByRole('region', { name: 'Reader settings' }).getByRole('button', { name: 'Light' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });
});
