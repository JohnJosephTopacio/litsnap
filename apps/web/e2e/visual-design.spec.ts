// VIS-3, VIS-4, VIS-7 and VIS-8 from docs/features/visual-design.md (VIS-5 is with RD-17 in
// settings.spec.ts). Runs against `vite preview` with the production CSP.
import { expect, test, type Page } from '@playwright/test';
import { bookFrame } from './book';
import { colouredEpub, JEKYLL, JEKYLL_TITLE } from './fixtures';

const fontFamily = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => getComputedStyle(el).fontFamily);

/** Both Jost weights the interface uses were loaded. (`fonts.check` would accept the nearest one.) */
const jostLoaded = (page: Page) =>
  page.evaluate(async () => {
    await document.fonts.ready;
    const loaded = [...document.fonts]
      .filter((face) => face.family.replaceAll('"', '') === 'Jost' && face.status === 'loaded')
      .map((face) => face.weight);
    return ['400', '500'].every((weight) => loaded.includes(weight));
  });

test('VIS-3: our interface is in Jost from our own origin; the book never gets it', async ({
  page,
  baseURL,
}) => {
  const fontRequests: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'font') fontRequests.push(request.url());
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'LitSnap' })).toBeVisible();
  expect(await jostLoaded(page)).toBe(true);
  expect(await fontFamily(page, 'h1')).toMatch(/^Jost\b/);
  expect(await fontFamily(page, 'button')).toMatch(/^Jost\b/);
  expect(fontRequests.some((url) => url.includes('jost'))).toBe(true);
  for (const url of fontRequests) expect(new URL(url).origin).toBe(new URL(baseURL ?? '').origin);

  await page.locator('input[type="file"]').setInputFiles(colouredEpub());
  const frame = await bookFrame(page, 'Plain paragraph.');
  const bookFonts = await frame
    .locator('body, body *')
    .evaluateAll((elements) => elements.map((el) => getComputedStyle(el).fontFamily));
  expect(bookFonts.length).toBeGreaterThan(0);
  for (const family of bookFonts) expect(family).not.toMatch(/Jost/);
});

test('VIS-4: Jost loads under the production CSP without violations', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (message.text().includes('Content Security Policy')) violations.push(message.text());
  });

  await page.goto('/');
  // Fonts load when text uses them, so wait for React to draw some first.
  await expect(page.getByRole('heading', { level: 1, name: 'LitSnap' })).toBeVisible();

  expect(await jostLoaded(page)).toBe(true);
  expect(violations).toEqual([]);
});

test('VIS-7: keyboard focus shows a 2 px outline in the ink colour', async ({ page }) => {
  await page.goto('/');
  // The first control on the start screen is the theme toggle (RD-33).
  const button = page.getByRole('group', { name: 'Theme' }).getByRole('button', { name: 'Light' });
  await expect(button).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(button).toBeFocused();

  const outline = await button.evaluate((el) => {
    const style = getComputedStyle(el);
    return [style.outlineStyle, style.outlineWidth, style.outlineColor];
  });
  const ink = await page.evaluate(() => getComputedStyle(document.body).color);
  expect(outline).toEqual(['solid', '2px', ink]);
});

test.describe('in a 375 × 667 window', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  const scrollsSideways = (page: Page) =>
    page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

  test('VIS-8: the open screen and the reader fit, and a long title is cut', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Open a book' })).toBeVisible();
    expect(await scrollsSideways(page)).toBe(false);

    await page.locator('input[type="file"]').setInputFiles(JEKYLL);
    const title = page.getByRole('heading', { level: 1, name: JEKYLL_TITLE });
    await expect(title).toBeAttached();
    for (const name of ['Contents', 'Settings', 'Home']) {
      await expect(page.getByRole('button', { name, exact: true })).toBeInViewport({ ratio: 1 });
    }
    expect(await scrollsSideways(page)).toBe(false);
    // Cut with an ellipsis on one line, not wrapped.
    expect(await title.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  });
});
