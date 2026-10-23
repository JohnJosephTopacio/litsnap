// Opening books: RD-2…7 from docs/features/epub-reader.md (and saving, from the "Opening a book"
// flow). Runs against `vite preview` with the production CSP.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import {
  JEKYLL,
  JEKYLL_TITLE,
  SECOND_TITLE,
  corruptEpub,
  fakeDrmEpub,
  pdfFile,
  secondEpub,
  textFile,
  type FixtureFile,
} from './fixtures';

interface Stored {
  titles: string[];
  current: { title: string } | undefined;
}

/** What LitSnap has saved, read straight from IndexedDB. */
function stored(page: Page): Promise<Stored> {
  return page.evaluate(async () => {
    // Opening a database that doesn't exist would *create* it (empty, at version 1) and break
    // the app's own schema upgrade, so check first.
    const exists = (await indexedDB.databases()).some((db) => db.name === 'litsnap');
    if (!exists) return { titles: [], current: undefined };
    return new Promise<Stored>((resolve, reject) => {
      const request = indexedDB.open('litsnap');
      request.onerror = () => {
        reject(request.error ?? new Error('open failed'));
      };
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(['books', 'settings']);
        const books = tx.objectStore('books').getAll();
        const currentId = tx.objectStore('settings').get('currentBookId');
        tx.oncomplete = () => {
          const all = books.result as { id: string; title: string }[];
          const current = all.find((book) => book.id === currentId.result);
          resolve({
            titles: all.map((book) => book.title).sort(),
            current: current && { title: current.title },
          });
          db.close();
        };
      };
    });
  });
}

async function pick(page: Page, file: string | FixtureFile) {
  await page.locator('input[type="file"]').setInputFiles(file);
}

/** Simulates dragging a file from the desktop and dropping it on the open screen. */
async function drop(page: Page, file: FixtureFile) {
  const dataTransfer = await page.evaluateHandle(
    ({ base64, name, mimeType }) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const transfer = new DataTransfer();
      transfer.items.add(new File([bytes], name, { type: mimeType }));
      return transfer;
    },
    { base64: file.buffer.toString('base64'), name: file.name, mimeType: file.mimeType },
  );
  await page.locator('.drop-zone').dispatchEvent('dragover', { dataTransfer });
  await page.locator('.drop-zone').dispatchEvent('drop', { dataTransfer });
}

const jekyllFile = (): FixtureFile => ({
  name: 'jekyll-and-hyde.epub',
  mimeType: 'application/epub+zip',
  buffer: readFileSync(JEKYLL),
});

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('opening a book saves it and makes it current', async ({ page }) => {
  await pick(page, JEKYLL);

  await expect(page.getByRole('heading', { level: 1, name: JEKYLL_TITLE })).toBeVisible();
  await expect
    .poll(() => stored(page))
    .toEqual({
      titles: [JEKYLL_TITLE],
      current: { title: JEKYLL_TITLE },
    });
});

test('RD-2: dropping a book on the page opens it', async ({ page }) => {
  await drop(page, jekyllFile());

  await expect(page.getByRole('heading', { level: 1, name: JEKYLL_TITLE })).toBeVisible();
  await expect.poll(async () => (await stored(page)).current).toEqual({ title: JEKYLL_TITLE });
});

for (const [how, open] of [
  ['picked', pick],
  ['dropped', drop],
] as const) {
  for (const file of [pdfFile, textFile]) {
    test(`RD-3: a ${file().name} that is ${how} is not supported`, async ({ page }) => {
      await open(page, file());

      await expect(page.getByRole('alert')).toHaveText('Only EPUB files are supported for now.');
      expect(await stored(page)).toEqual({ titles: [], current: undefined });
    });
  }
}

test('RD-4: a DRM-protected book is rejected, with links to DRM-free books', async ({ page }) => {
  await pick(page, fakeDrmEpub());

  const alert = page.getByRole('alert');
  await expect(alert).toContainText("This book is DRM-protected and can't be opened.");
  await expect(alert.getByRole('link', { name: 'Project Gutenberg' })).toHaveAttribute(
    'href',
    'https://www.gutenberg.org/',
  );
  await expect(alert.getByRole('link', { name: 'Standard Ebooks' })).toHaveAttribute(
    'href',
    'https://standardebooks.org/',
  );
  expect(await stored(page)).toEqual({ titles: [], current: undefined });
});

test('RD-5: an invalid EPUB is rejected', async ({ page }) => {
  await pick(page, corruptEpub());

  await expect(page.getByRole('alert')).toHaveText("This file couldn't be opened as an EPUB.");
  expect(await stored(page)).toEqual({ titles: [], current: undefined });
});

test('RD-6: when storage is full, the book still opens, unsaved, with a message', async ({
  page,
}) => {
  // Shrink this origin's real storage quota (Chromium DevTools Protocol), so IndexedDB itself
  // rejects the write: the same path a full disk takes.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Storage.overrideQuotaForOrigin', {
    origin: new URL(page.url()).origin,
    quotaSize: 50_000,
  });

  await pick(page, JEKYLL);

  await expect(page.getByRole('heading', { level: 1, name: JEKYLL_TITLE })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText(
    'Not enough browser storage to save this book.',
  );
  expect((await stored(page)).titles).toEqual([]);
});

test('RD-7: "Open another book" opens it and makes it current', async ({ page }) => {
  await pick(page, JEKYLL);
  await expect.poll(async () => (await stored(page)).current).toEqual({ title: JEKYLL_TITLE });

  await page.getByRole('button', { name: 'Open another book' }).click();
  await pick(page, secondEpub());

  await expect(page.getByRole('heading', { level: 1, name: SECOND_TITLE })).toBeVisible();
  await expect
    .poll(() => stored(page))
    .toEqual({
      titles: [SECOND_TITLE, JEKYLL_TITLE].sort(),
      current: { title: SECOND_TITLE },
    });
});

test('choosing a rejected file while reading keeps the current book open', async ({ page }) => {
  await pick(page, JEKYLL);
  await expect(page.getByRole('heading', { level: 1, name: JEKYLL_TITLE })).toBeVisible();

  await pick(page, fakeDrmEpub());

  await expect(page.getByRole('alert')).toContainText('DRM-protected');
  await expect(page.getByRole('heading', { level: 1, name: JEKYLL_TITLE })).toBeVisible();
});
