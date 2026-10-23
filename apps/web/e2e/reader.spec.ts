// EPUB reader acceptance criteria from docs/features/epub-reader.md, run against `vite preview`
// with the production CSP. foliate renders each section in an iframe (from a blob: URL) inside
// closed shadow roots, so tests reach the book through page.frames().
import { expect, test, type Frame, type Page } from '@playwright/test';
import {
  HOSTILE_TITLE,
  JEKYLL,
  JEKYLL_TITLE,
  PWNED_KEYS,
  REMOTE_HOST,
  hostileTitleEpub,
  linksEpub,
  remoteImageEpub,
  scriptedEpub,
  type FixtureFile,
} from './fixtures';

async function openBook(page: Page, file: string | FixtureFile) {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(file);
}

/** The book iframe once it shows `text`. */
async function bookFrame(page: Page, text: string): Promise<Frame> {
  let found: Frame | undefined;
  await expect
    .poll(
      async () => {
        for (const frame of page.frames()) {
          if (!frame.url().startsWith('blob:')) continue;
          const body = await frame
            .locator('body')
            .textContent({ timeout: 500 })
            .catch(() => '');
          if (body?.includes(text)) found = frame;
        }
        return found !== undefined;
      },
      { message: `a book frame showing "${text}"` },
    )
    .toBe(true);
  if (!found) throw new Error('unreachable');
  return found;
}

/** Negative tests need a moment for anything that *would* happen (a request, a script) to happen. */
const settle = (page: Page) => page.waitForTimeout(750);

test('RD-1: opening a book via the picker renders it and shows its title', async ({ page }) => {
  await openBook(page, JEKYLL);

  await expect(page.getByRole('heading', { level: 1, name: JEKYLL_TITLE })).toBeVisible();
  await expect
    .poll(() => page.frames().some((frame) => frame.url().startsWith('blob:')))
    .toBe(true);
});

test('RD-21: scripts in books never run', async ({ page, context }) => {
  const popups: string[] = [];
  context.on('page', (popup) => popups.push(popup.url()));

  await openBook(page, scriptedEpub());
  const frame = await bookFrame(page, 'A perfectly ordinary chapter.');
  await frame.getByText('An innocent link').click();
  await settle(page);

  const stored = await page.evaluate(() => Object.keys(localStorage));
  expect(stored.filter((key) => PWNED_KEYS.includes(key))).toEqual([]);
  expect(popups).toEqual([]);
});

test('RD-22: books cannot load remote resources', async ({ page, context }) => {
  // Chromium reports a CSP-blocked load as a request that then fails, so count what actually
  // reaches the network instead: a route handler only runs for requests that would leave.
  const reachedNetwork: string[] = [];
  await context.route(`**://${REMOTE_HOST}/**`, (route) => {
    reachedNetwork.push(route.request().url());
    return route.fulfill({ status: 204 });
  });
  const blockedByCsp: string[] = [];
  page.on('requestfailed', (request) => {
    if (request.failure()?.errorText === 'csp') blockedByCsp.push(request.url());
  });

  await openBook(page, remoteImageEpub());
  await bookFrame(page, 'Pixel below.');
  await settle(page);

  expect(reachedNetwork).toEqual([]);
  // Positive control: the book did try, and the CSP is what stopped it.
  expect(blockedByCsp).toEqual([`https://${REMOTE_HOST}/pixel.png`]);
});

test('RD-24: book metadata is shown as text, never as HTML', async ({ page }) => {
  await openBook(page, hostileTitleEpub());

  const title = page.getByRole('heading', { level: 1 });
  await expect(title).toHaveText(HOSTILE_TITLE);
  await expect(page.locator('header img')).toHaveCount(0);
  await settle(page);
  expect(await page.evaluate(() => localStorage.getItem('pwned-title'))).toBeNull();
});

test('RD-20: http(s) links open in a new tab without access to LitSnap; others do nothing', async ({
  page,
  context,
}) => {
  // Never touch the real site from tests.
  await context.route('https://standardebooks.org/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>stub</title>' }),
  );
  await openBook(page, linksEpub());
  const frame = await bookFrame(page, 'Standard Ebooks');

  const [popup] = await Promise.all([
    context.waitForEvent('page'),
    frame.getByText('Standard Ebooks').click(),
  ]);
  await expect(popup).toHaveURL('https://standardebooks.org/');
  expect(await popup.evaluate(() => window.opener === null)).toBe(true);
  await popup.close();

  const popups: string[] = [];
  context.on('page', (p) => popups.push(p.url()));
  await frame.getByText('Email someone').click();
  await settle(page);
  expect(popups).toEqual([]);
});
