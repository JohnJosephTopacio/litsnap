// The reader's chrome hides while reading: CHROME-1…13 from docs/features/reader-chrome.md, against
// `vite preview` (the production build). The timing rules are unit-tested in
// chromeVisibility.test.ts; these check the wiring, in real time (the countdown is 3 s).
import { expect, test, type Frame, type Page } from '@playwright/test';
import { bookFrame } from './book';
import { FIXED_TITLE, JEKYLL, fixedLayoutEpub, footnoteEpub, lookupEpub } from './fixtures';
import { dragSelect, lookupMenu, lookupModal, selectedText, textBoxes } from './selection';
import { storedSetting } from './storage';
import { fakeWorker } from './worker';

const reader = (page: Page) => page.locator('.reader');
const topBar = (page: Page) => page.locator('.top-bar');
const bottomBar = (page: Page) => page.getByRole('contentinfo', { name: 'Reading progress' });

/** Longer than the countdown, with room for a slow CI machine. */
const HIDES_WITHIN = { timeout: 6000 };

const shown = (page: Page) => expect(reader(page)).toHaveAttribute('data-chrome', 'shown');
/** Hidden now, or within a second: a retrying check, so it must stay well under the countdown. */
const hidden = (page: Page, options = { timeout: 1000 }) =>
  expect(reader(page)).toHaveAttribute('data-chrome', 'hidden', options);

/**
 * Nothing showed the chrome. Read once after a pause, never retried: a retrying check would
 * outlast the countdown, and pass even if the chrome had wrongly shown and hidden again.
 */
async function stillHidden(page: Page) {
  await page.waitForTimeout(500);
  expect(await reader(page).getAttribute('data-chrome')).toBe('hidden');
}

const opacity = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => getComputedStyle(el).opacity);

/** Somewhere the pointer can rest that is neither a hot zone nor a gutter: the middle of the book. */
async function restInBook(page: Page) {
  const size = page.viewportSize() ?? { width: 1280, height: 720 };
  await page.mouse.move(size.width / 2, size.height / 2);
}

/** Opens a book, and waits for its chrome to hide by itself. */
async function openHidden(page: Page, file: Parameters<Page['setInputFiles']>[1], text: string) {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(file);
  const frame = await bookFrame(page, text);
  await restInBook(page);
  await hidden(page, HIDES_WITHIN);
  return frame;
}

/** A point on blank space under the lookup book's last paragraph, in page coordinates. */
async function blankPoint(frame: Frame) {
  const { first } = await textBoxes(frame, 'Careful');
  return { x: first.left + 20, y: first.bottom + 120 };
}

async function clickAt(page: Page, { x, y }: { x: number; y: number }) {
  await page.mouse.click(x, y);
}

const percent = async (page: Page) =>
  Number(/(\d+)%/.exec((await bottomBar(page).textContent()) ?? '')?.[1] ?? -1);

const bookBox = (page: Page) => page.locator('foliate-view').boundingBox();

test('CHROME-1: shown when a book opens, then hidden after 3 seconds', async ({ page }) => {
  await page.goto('/');
  const opened = Date.now();
  await page.locator('input[type="file"]').setInputFiles(lookupEpub());
  await bookFrame(page, 'hipped roof');
  await restInBook(page);
  await shown(page);
  expect(await opacity(page, '.top-bar')).toBe('1');

  await hidden(page, HIDES_WITHIN);
  // The countdown starts as the book opens, which is after we chose the file: never sooner.
  expect(Date.now() - opened).toBeGreaterThanOrEqual(3000);
  for (const part of ['.top-bar', '.bottom-bar', '.page-arrow']) {
    await expect.poll(() => opacity(page, part)).toBe('0');
  }
  // Still there for the keyboard and screen readers (reader-chrome.md, Terms).
  await expect(page.getByRole('button', { name: 'Contents' })).toBeAttached();
});

test('CHROME-2, CHROME-4: clicking blank space toggles the chrome, and the book never moves', async ({
  page,
}) => {
  const frame = await openHidden(page, lookupEpub(), 'hipped roof');
  const box = await bookBox(page);
  const at = await percent(page);
  const point = await blankPoint(frame);

  await clickAt(page, point);
  await shown(page);
  expect(await bookBox(page)).toEqual(box);

  await clickAt(page, point);
  await hidden(page); // at once, not after the countdown
  expect(await bookBox(page)).toEqual(box);
  expect(await percent(page)).toBe(at);

  // A click that shows it starts the countdown again.
  await clickAt(page, point);
  await shown(page);
  await hidden(page, HIDES_WITHIN);
});

test('CHROME-5: clicks on text, double-clicks and clicks that clear a selection change nothing', async ({
  page,
}) => {
  const frame = await openHidden(page, lookupEpub(), 'hipped roof');
  const { first: word } = await textBoxes(frame, 'house');

  await page.mouse.click(word.left + 3, (word.top + word.bottom) / 2);
  await stillHidden(page);

  // A double-click selects the word, and only that.
  await page.mouse.dblclick(word.left + 3, (word.top + word.bottom) / 2);
  // Windows includes the trailing space.
  await expect.poll(async () => (await selectedText(frame)).trim()).toBe('house');
  await stillHidden(page);

  // On blank space, a click while text is selected only clears it.
  const point = await blankPoint(frame);
  await clickAt(page, point);
  await expect.poll(() => selectedText(frame)).toBe('');
  await stillHidden(page);

  // Then a click there toggles, as usual.
  await clickAt(page, point);
  await shown(page);
});

test('CHROME-5: past the end of a line is blank space, though the caret snaps to the text', async ({
  page,
}) => {
  const frame = await openHidden(page, lookupEpub(), 'hipped roof');
  const { last } = await textBoxes(frame, 'The house', 'chimneys.');

  await page.mouse.click(last.right + 60, (last.top + last.bottom) / 2);

  await shown(page);
});

test("CHROME-4: foliate's margin around the page is blank space too", async ({ page }) => {
  await openHidden(page, lookupEpub(), 'hipped roof');
  const view = await bookBox(page);
  if (!view) throw new Error('no book');

  // The strip just under the top bar: foliate's margin, outside the book's iframe.
  await page.mouse.click(view.x + view.width / 2, view.y + 12);

  await shown(page);
});

test('CHROME-5: an image that is a link changes nothing either', async ({ page }) => {
  const frame = await openHidden(page, footnoteEpub(), 'hipped roof');

  await frame.locator('#pic-ref img').click();

  await bookFrame(page, 'Footnote one');
  await stillHidden(page);
});

test('CHROME-5: following a link inside the book changes nothing', async ({ page }) => {
  const frame = await openHidden(page, footnoteEpub(), 'hipped roof');

  await frame.locator('#ref-1').click();

  await bookFrame(page, 'Footnote one');
  await stillHidden(page);
});

test('CHROME-3: hovering the top or bottom strip shows the chrome until the pointer leaves', async ({
  page,
}) => {
  await openHidden(page, lookupEpub(), 'hipped roof');

  // Moving about over the book doesn't.
  await page.mouse.move(500, 300);
  await page.mouse.move(700, 400);
  await stillHidden(page);

  const box = await topBar(page).boundingBox();
  if (!box) throw new Error('no top bar');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await shown(page);
  await page.waitForTimeout(4000);
  await shown(page);

  await restInBook(page);
  await page.waitForTimeout(2000);
  await shown(page);
  await hidden(page, HIDES_WITHIN);

  const bottom = await bottomBar(page).boundingBox();
  if (!bottom) throw new Error('no bottom bar');
  await page.mouse.move(bottom.x + bottom.width / 2, bottom.y + bottom.height / 2);
  await shown(page);
});

test('CHROME-6: the gutters turn pages while hidden, and a hovered one shows its arrow', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(JEKYLL);
  await expect(bottomBar(page)).toContainText('%');
  await page.getByRole('button', { name: 'Contents' }).click();
  await page
    .getByRole('navigation', { name: 'Table of contents' })
    .getByText('Story of the Door')
    .click();
  await restInBook(page);
  await hidden(page, HIDES_WITHIN);
  const before = await percent(page);

  const next = page.getByRole('button', { name: 'Next page' });
  await next.hover();
  await expect.poll(() => opacity(page, '.page-arrow:last-of-type')).toBe('1');
  expect(await opacity(page, '.page-arrow')).toBe('0'); // the other arrow
  expect(await opacity(page, '.top-bar')).toBe('0');

  await next.click();

  await expect.poll(() => percent(page)).toBeGreaterThan(before);
  await stillHidden(page);
});

test('CHROME-7: Tab reaches the hidden chrome and shows it; page keys never do', async ({
  page,
}) => {
  const frame = await openHidden(page, lookupEpub(), 'hipped roof');
  const { first: word } = await textBoxes(frame, 'house');
  await page.mouse.click(word.left + 3, (word.top + word.bottom) / 2); // focus in the book

  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('PageDown');
  await stillHidden(page);

  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Next page' })).toBeFocused();
  await shown(page);
  await page.waitForTimeout(4000);
  await shown(page); // held while focus stays

  await page.mouse.click(word.left + 3, (word.top + word.bottom) / 2); // focus back in the book
  await hidden(page, HIDES_WITHIN);
});

test('CHROME-8: an open panel keeps the chrome shown; closing it starts the countdown', async ({
  page,
}) => {
  await openHidden(page, lookupEpub(), 'hipped roof');
  await page.getByRole('button', { name: 'Settings' }).click();
  await restInBook(page);

  await page.waitForTimeout(4000);
  await shown(page);

  // With the mouse: Esc would put keyboard focus back on Settings, which holds it (CHROME-7).
  await page.getByRole('button', { name: 'Settings' }).click();
  await restInBook(page);
  await hidden(page, HIDES_WITHIN);
});

test('CHROME-9: the selection menu and the lookup modal leave hidden chrome hidden', async ({
  page,
}) => {
  await fakeWorker(page);
  const frame = await openHidden(page, lookupEpub(), 'hipped roof');

  await dragSelect(page, frame, 'hipped', 'roof');
  await expect(lookupMenu(page)).toBeVisible();
  await stillHidden(page);

  await lookupMenu(page).getByRole('menuitem', { name: 'Definition' }).click();
  await expect(lookupModal(page)).toBeVisible();
  await stillHidden(page);

  await page.keyboard.press('Escape');
  await expect(lookupModal(page)).toBeHidden();
  await stillHidden(page);
});

test.describe('on a touch screen', () => {
  test.use({ hasTouch: true });

  test('CHROME-10: a tap on blank space toggles; a tap on a bar is not a hover', async ({
    page,
  }) => {
    const frame = await openHidden(page, lookupEpub(), 'hipped roof');

    const title = await page.getByRole('heading', { level: 1 }).boundingBox();
    if (!title) throw new Error('no title');
    await page.touchscreen.tap(title.x + title.width / 2, title.y + title.height / 2);
    await stillHidden(page);

    const point = await blankPoint(frame);
    await page.touchscreen.tap(point.x, point.y);
    await shown(page);
    // Slower than a double tap, whose second tap doesn't count (CHROME-5).
    await page.waitForTimeout(800);
    await page.touchscreen.tap(point.x, point.y);
    await hidden(page);
  });
});

test('CHROME-11: Always shown keeps the chrome, ignores blank clicks, and survives a reload', async ({
  page,
}) => {
  const frame = await openHidden(page, lookupEpub(), 'hipped roof');
  await page.getByRole('button', { name: 'Settings' }).click();
  const always = page
    .getByRole('group', { name: 'Controls' })
    .getByRole('button', { name: 'Always shown' });
  await expect(page.getByRole('button', { name: 'Auto-hide' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await always.click();
  await expect(always).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await restInBook(page);
  await clickAt(page, await blankPoint(frame));
  await page.waitForTimeout(4000);
  await shown(page);
  expect(await opacity(page, '.page-arrow')).toBe('0.45'); // their resting look

  await expect.poll(() => storedSetting(page, 'controls')).toBe('always');
  await page.reload();
  await bookFrame(page, 'hipped roof');
  await restInBook(page);
  await page.waitForTimeout(4000);
  await shown(page);
});

test('CHROME-12: the chrome fades over 200 ms', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(lookupEpub());
  await bookFrame(page, 'hipped roof');

  for (const part of ['.top-bar', '.bottom-bar', '.page-arrow']) {
    const style = await page
      .locator(part)
      .first()
      .evaluate((el) => [
        getComputedStyle(el).transitionProperty,
        getComputedStyle(el).transitionDuration,
      ]);
    expect(style).toEqual(['opacity', '0.2s']);
  }
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('CHROME-12, VIS-9: the chrome changes at once', async ({ page }) => {
    await page.goto('/');
    await page.locator('input[type="file"]').setInputFiles(lookupEpub());
    await bookFrame(page, 'hipped roof');

    expect(await topBar(page).evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s');
  });
});

test('CHROME-13: scrolled layout — hides, toggles, and scrolling never shows it', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(JEKYLL);
  await expect(bottomBar(page)).toContainText('%');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Scrolled' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Contents' }).click();
  await page
    .getByRole('navigation', { name: 'Table of contents' })
    .getByText('Story of the Door')
    .click();
  await restInBook(page);
  await hidden(page, HIDES_WITHIN);

  // The chapter heading's line has blank space to its right.
  const frame = await bookFrame(page, 'rugged countenance');
  const { last } = await textBoxes(frame, 'Story of the Door');
  const beside = { x: last.right + 80, y: (last.top + last.bottom) / 2 };
  await clickAt(page, beside);
  await shown(page);
  await clickAt(page, beside);
  await hidden(page);

  await restInBook(page);
  await page.mouse.wheel(0, 600);
  await stillHidden(page);
});

test('CHROME-13: a fixed-layout book hides and toggles too', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(fixedLayoutEpub());
  await expect(page.getByRole('heading', { level: 1, name: FIXED_TITLE })).toBeVisible();
  const frame = await bookFrame(page, 'A fixed page.');
  await restInBook(page);
  await hidden(page, HIDES_WITHIN);

  const { first } = await textBoxes(frame, 'A fixed page.');
  await page.mouse.click(first.left + 10, first.bottom + 150);
  await shown(page);
});
