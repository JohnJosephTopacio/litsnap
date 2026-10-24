// Settings, footnotes and dropping onto the reader: RD-15…19, RD-26 and TERMS-4 (settings popover)
// from docs/features/epub-reader.md and terms-page.md. Runs against `vite preview` with the
// production CSP.
import { expect, test, type Frame, type Page } from '@playwright/test';
import { bookFrame } from './book';
import { storedSetting } from './storage';
import {
  JEKYLL,
  SECOND_TITLE,
  colouredEpub,
  footnoteEpub,
  secondEpub,
  type FixtureFile,
} from './fixtures';

const LIGHT = { background: 'rgb(253, 252, 249)', text: 'rgb(31, 29, 26)' };
const DARK = { background: 'rgb(23, 22, 26)', text: 'rgb(232, 230, 227)' };
const TRANSPARENT = 'rgba(0, 0, 0, 0)';

const bottomBar = (page: Page) => page.getByRole('contentinfo', { name: 'Reading progress' });
const settingsPanel = (page: Page) => page.getByRole('region', { name: 'Reader settings' });

async function open(page: Page, file: string | FixtureFile) {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(bottomBar(page)).toContainText('%');
}

async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(settingsPanel(page)).toBeVisible();
}

async function goToChapter(page: Page, label: string) {
  await page.getByRole('button', { name: 'Contents' }).click();
  await page.getByRole('navigation', { name: 'Table of contents' }).getByText(label).click();
  await expect(bottomBar(page)).toContainText(label);
}

async function percent(page: Page): Promise<number> {
  const match = /(\d+)%/.exec((await bottomBar(page).textContent()) ?? '');
  return match?.[1] ? Number(match[1]) : -1;
}

const style = (frame: Frame, selector: string, property: string) =>
  frame
    .locator(selector)
    .first()
    .evaluate((el, prop) => getComputedStyle(el).getPropertyValue(prop), property);

const fontPx = async (frame: Frame) => parseFloat(await style(frame, 'p', 'font-size'));

test('RD-15: font size steps by 10%, survives a reload, and stops at 80% and 200%', async ({
  page,
}) => {
  await open(page, JEKYLL);
  await goToChapter(page, 'Story of the Door');
  const base = await fontPx(await bookFrame(page, 'Utterson the lawyer'));

  await openSettings(page);
  await expect(settingsPanel(page).locator('output')).toHaveText('100%');
  await page.getByRole('button', { name: 'Larger text' }).click();
  await page.getByRole('button', { name: 'Larger text' }).click();
  await expect(settingsPanel(page).locator('output')).toHaveText('120%');
  await expect
    .poll(async () => (await fontPx(await bookFrame(page, 'Utterson the lawyer'))) / base)
    .toBeCloseTo(1.2, 2);

  await expect.poll(() => storedSetting(page, 'fontSize')).toBe(120);
  await page.reload();
  // Position isn't what this test is about (RD-8 is), so don't depend on it having been saved.
  await expect(bottomBar(page)).toContainText('%');
  await goToChapter(page, 'Story of the Door');
  await expect
    .poll(async () => (await fontPx(await bookFrame(page, 'Utterson the lawyer'))) / base)
    .toBeCloseTo(1.2, 2);
  await openSettings(page);
  await expect(settingsPanel(page).locator('output')).toHaveText('120%');

  const smaller = page.getByRole('button', { name: 'Smaller text' });
  const larger = page.getByRole('button', { name: 'Larger text' });
  for (let i = 0; i < 4; i++) await smaller.click();
  await expect(settingsPanel(page).locator('output')).toHaveText('80%');
  await expect(smaller).toBeDisabled();
  for (let i = 0; i < 12; i++) await larger.click();
  await expect(settingsPanel(page).locator('output')).toHaveText('200%');
  await expect(larger).toBeDisabled();
});

test.describe('with the OS in dark mode', () => {
  test.use({ colorScheme: 'dark' });

  test('RD-16: follows the OS until the user picks a theme, then keeps it', async ({ page }) => {
    await open(page, colouredEpub());
    const frame = await bookFrame(page, 'Plain paragraph.');
    await expect.poll(() => style(frame, 'body', 'background-color')).toBe(DARK.background);

    await openSettings(page);
    await expect(page.getByRole('button', { name: 'Dark' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', { name: 'Light' }).click();
    await expect.poll(() => style(frame, 'body', 'background-color')).toBe(LIGHT.background);

    await expect.poll(() => storedSetting(page, 'theme')).toBe('light');
    await page.reload();
    const reloaded = await bookFrame(page, 'Plain paragraph.');
    await expect.poll(() => style(reloaded, 'body', 'background-color')).toBe(LIGHT.background);
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
  });
});

for (const [theme, colors] of [
  ['Light', LIGHT],
  ['Dark', DARK],
] as const) {
  test(`RD-17: the ${theme} theme overrides publisher colours, without inverting images`, async ({
    page,
  }) => {
    await open(page, colouredEpub());
    await openSettings(page);
    await page.getByRole('button', { name: theme }).click();
    const frame = await bookFrame(page, 'Plain paragraph.');

    await expect.poll(() => style(frame, 'body', 'background-color')).toBe(colors.background);
    expect(await style(frame, 'p.note', 'color')).toBe(colors.text);
    expect(await style(frame, 'p.note', 'background-color')).toBe(TRANSPARENT);
    expect(await style(frame, 'body', 'color')).toBe(colors.text);
    expect(await style(frame, '#pic', 'filter')).toBe('none');
  });
}

test('RD-18: scrolled layout scrolls, keeps the place, and survives a reload', async ({ page }) => {
  await open(page, JEKYLL);
  // The long first chapter, one page in, so there's both a place to keep and room to scroll.
  await goToChapter(page, 'Story of the Door');
  const chapterStart = await percent(page);
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect.poll(() => percent(page)).toBeGreaterThan(chapterStart);
  const before = await percent(page);
  // A few ordinary wheel steps over the book, as a person scrolling would.
  const scroll = async () => {
    const box = await page.locator('.reader-view').boundingBox();
    if (!box) throw new Error('no reader');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(150);
    }
  };

  await openSettings(page);
  await page.getByRole('button', { name: 'Scrolled' }).click();
  await expect(bottomBar(page)).toContainText('Story of the Door');
  expect(Math.abs((await percent(page)) - before)).toBeLessThanOrEqual(2);

  await page.keyboard.press('Escape');
  // foliate re-lays the book out after a layout change or a jump; wheel input that arrives
  // meanwhile is lost, so give it a moment, as a person would take.
  await page.waitForTimeout(1000);
  const atSwitch = await percent(page);
  await scroll();
  await expect.poll(() => percent(page)).toBeGreaterThan(atSwitch);

  await expect.poll(() => storedSetting(page, 'layout')).toBe('scrolled');
  await page.reload();
  await expect(bottomBar(page)).toContainText('%');
  await goToChapter(page, 'Story of the Door'); // position isn't what this test is about
  await page.waitForTimeout(1000);
  const afterReload = await percent(page);
  await scroll();
  await expect.poll(() => percent(page)).toBeGreaterThan(afterReload);
  await openSettings(page);
  await expect(page.getByRole('button', { name: 'Scrolled' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('RD-19: a footnote link goes to the footnote', async ({ page }) => {
  await open(page, footnoteEpub());
  const frame = await bookFrame(page, 'hipped roof');

  await frame.locator('#ref-1').click();

  await expect(bottomBar(page)).toContainText('Endnotes');
  await bookFrame(page, 'Footnote one');
});

test('TERMS-4: the settings popover links to the Terms in a new tab', async ({ page, context }) => {
  await open(page, JEKYLL);
  await openSettings(page);

  const [terms] = await Promise.all([
    context.waitForEvent('page'),
    settingsPanel(page).getByRole('link', { name: 'Terms' }).click(),
  ]);

  await expect(terms).toHaveURL(/\/terms$/);
});

test('Esc closes the settings popover and returns focus to its button', async ({ page }) => {
  await open(page, JEKYLL);
  await openSettings(page);

  await page.keyboard.press('Escape');

  await expect(settingsPanel(page)).toBeHidden();
  await expect(page.getByRole('button', { name: 'Settings' })).toBeFocused();
});

/** Drops `file` on `target`, building the DataTransfer inside `frame` (the page or the book). */
async function dropOn(frame: Page | Frame, selector: string, file: FixtureFile) {
  const dataTransfer = await frame.evaluateHandle(
    ({ base64, name, mimeType }) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const transfer = new DataTransfer();
      transfer.items.add(new File([bytes], name, { type: mimeType }));
      return transfer;
    },
    { base64: file.buffer.toString('base64'), name: file.name, mimeType: file.mimeType },
  );
  await frame.locator(selector).dispatchEvent('dragover', { dataTransfer });
  await frame.locator(selector).dispatchEvent('drop', { dataTransfer });
}

test('RD-26: dropping a book on the reader opens it', async ({ page }) => {
  await open(page, JEKYLL);

  await dropOn(page, '.top-bar', secondEpub());

  await expect(page.getByRole('heading', { level: 1, name: SECOND_TITLE })).toBeVisible();
});

test('RD-26: dropping a book onto the page of the book opens it too', async ({ page }) => {
  await open(page, secondEpub());
  const frame = await bookFrame(page, 'hipped roof');

  await dropOn(frame, 'body', colouredEpub());

  await bookFrame(page, 'Plain paragraph.');
  await expect(page.getByRole('heading', { level: 1, name: 'Test Book' })).toBeVisible();
  // The browser's default would have navigated to the dropped file instead.
  expect(new URL(page.url()).pathname).toBe('/');
});
