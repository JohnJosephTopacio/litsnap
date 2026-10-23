// Position, reopening and navigation: RD-8…14 (and RD-24 for the TOC and bottom bar) from
// docs/features/epub-reader.md. Runs against `vite preview` with the production CSP.
import { expect, test, type Page } from '@playwright/test';
import { HOSTILE_TITLE, JEKYLL, JEKYLL_TITLE, hostileTocEpub } from './fixtures';
import { currentProgress, databaseReady, write } from './storage';

const CHAPTER_1 = 'Story of the Door';
const CHAPTER_3 = 'Dr. Jekyll Was Quite at Ease';
const CHAPTER_8 = 'The Last Night';

const bottomBar = (page: Page) => page.getByRole('contentinfo', { name: 'Reading progress' });
const chapter = (page: Page) => bottomBar(page).locator('.chapter');

/** The progress % in the bottom bar, or -1 before the first page has rendered. */
async function percent(page: Page): Promise<number> {
  const text = (await bottomBar(page).textContent()) ?? '';
  const match = /(\d+)%/.exec(text);
  return match?.[1] ? Number(match[1]) : -1;
}

async function openJekyll(page: Page) {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(JEKYLL);
  await expect(page.getByRole('heading', { level: 1, name: JEKYLL_TITLE })).toBeVisible();
  await expect(bottomBar(page)).toContainText('%');
}

async function goToChapter(page: Page, label: string) {
  await page.getByRole('button', { name: 'Contents' }).click();
  await page.getByRole('navigation', { name: 'Table of contents' }).getByText(label).click();
  await expect(chapter(page)).toHaveText(label);
}

/** Waits until the (debounced) saved position matches where the reader is now. */
async function waitForSavedPosition(page: Page) {
  const shown = await percent(page);
  await expect
    .poll(async () => Math.round(((await currentProgress(page))?.fraction ?? -1) * 100))
    .toBe(shown);
}

test('RD-13: the TOC jumps to a chapter, highlights it, and closes', async ({ page }) => {
  await openJekyll(page);
  const toc = page.getByRole('navigation', { name: 'Table of contents' });

  await goToChapter(page, CHAPTER_3);
  await expect(toc).toBeHidden();

  await page.getByRole('button', { name: 'Contents' }).click();
  await expect(toc.getByRole('button', { name: CHAPTER_3 })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await expect(toc.getByRole('button', { name: CHAPTER_3 })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(toc).toBeHidden();
  await expect(page.getByRole('button', { name: 'Contents' })).toBeFocused();
});

test('RD-14: the bottom bar shows the chapter and a progress % that grows', async ({ page }) => {
  await openJekyll(page);

  await goToChapter(page, CHAPTER_1);
  const early = await percent(page);
  await goToChapter(page, CHAPTER_8);

  await expect.poll(() => percent(page)).toBeGreaterThan(early + 30);
});

test('RD-12: arrows and keys turn pages forward and back', async ({ page }) => {
  await openJekyll(page);
  await goToChapter(page, CHAPTER_3);
  const start = await percent(page);

  // One page at a time, waiting for each turn: like foliate's own reader, input that arrives
  // while a page-turn animation is still running is ignored. One spread here is about 2%.
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect.poll(() => percent(page)).toBeGreaterThan(start);
  await page.getByRole('button', { name: 'Previous page' }).click();
  await expect.poll(() => percent(page)).toBe(start);

  await page.keyboard.press('ArrowRight');
  await expect.poll(() => percent(page)).toBeGreaterThan(start);
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => percent(page)).toBe(start);

  // Focus inside the book's iframe: keys pressed there must still turn pages.
  const book = page.frames().find((frame) => frame.url().startsWith('blob:'));
  await book?.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('PageDown');
  await expect.poll(() => percent(page)).toBeGreaterThan(start);
  await page.keyboard.press('PageUp');
  await expect.poll(() => percent(page)).toBe(start);
});

test('RD-8: reloading reopens the same book at the same place, skipping the open screen', async ({
  page,
}) => {
  // Records whether the open screen ever appears on the reloaded page.
  await page.addInitScript(() => {
    new MutationObserver(() => {
      // documentElement, not body: this runs before <body> exists.
      if (document.documentElement.textContent.includes('Open a book')) {
        sessionStorage.setItem('saw-open-screen', String(performance.now()));
      }
    }).observe(document, { subtree: true, childList: true });
  });
  await openJekyll(page);
  await goToChapter(page, CHAPTER_3);
  const chapterStart = await percent(page);
  await page.getByRole('button', { name: 'Next page' }).click();
  // Wait for the turn to land before reading the position to compare against.
  await expect.poll(() => percent(page)).toBeGreaterThan(chapterStart);
  await waitForSavedPosition(page);
  const before = await percent(page);
  await page.evaluate(() => {
    sessionStorage.removeItem('saw-open-screen');
  });

  await page.reload();

  await expect(page.getByRole('heading', { level: 1, name: JEKYLL_TITLE })).toBeVisible();
  await expect(chapter(page)).toHaveText(CHAPTER_3);
  await expect.poll(() => percent(page)).toBe(before);
  expect(await page.evaluate(() => sessionStorage.getItem('saw-open-screen'))).toBeNull();
});

test('RD-9: a saved position that no longer resolves falls back to its fraction', async ({
  page,
}) => {
  await openJekyll(page);
  await waitForSavedPosition(page);
  await write(page, 'progress', { cfi: 'epubcfi(/6/998!/4/2/1:0)', fraction: 0.5, updatedAt: 0 });

  await page.reload();

  await expect(page.getByRole('heading', { level: 1, name: JEKYLL_TITLE })).toBeVisible();
  await expect.poll(() => percent(page)).toBeGreaterThanOrEqual(45);
  expect(await percent(page)).toBeLessThanOrEqual(55);
});

test('RD-10: if the current book is no longer stored, the open screen shows, quietly', async ({
  page,
}) => {
  await page.goto('/');
  await databaseReady(page);
  await write(page, 'settings', 'f'.repeat(64), { key: 'currentBookId' });

  await page.reload();

  await expect(page.getByRole('button', { name: 'Open a book' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('RD-11: if the stored book is broken, the open screen asks for the file again', async ({
  page,
}) => {
  await openJekyll(page);
  await waitForSavedPosition(page);
  await write(page, 'books', {}, { brokenBlob: true });

  await page.reload();

  await expect(page.getByRole('alert')).toHaveText(
    "This book couldn't be reopened. Please open the file again.",
  );
  await expect(page.getByRole('button', { name: 'Open a book' })).toBeVisible();
});

test('RD-24: TOC labels show as text in the TOC panel and bottom bar', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(hostileTocEpub());

  await expect(chapter(page)).toHaveText(HOSTILE_TITLE);
  await page.getByRole('button', { name: 'Contents' }).click();
  const toc = page.getByRole('navigation', { name: 'Table of contents' });
  await expect(toc.getByRole('button')).toHaveText([HOSTILE_TITLE]);
  await expect(page.locator('nav img, footer img')).toHaveCount(0);
});
