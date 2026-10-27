// Acceptance criteria CLIENT-9…11 from docs/features/lookup-client.md (and MODAL-20 from
// lookup-modal.md), against `vite preview`
// (the production build and CSP), with the Worker faked by `fakeWorker`.
import { expect, test, type Page } from '@playwright/test';
import type { LookupResult } from '@litsnap/shared';
import { dragSelect, lookupMenu, lookupModal, openLookupBook } from './selection';
import { fakeWorker, notFound, type WorkerReply } from './worker';

const HIPPED_ROOF: LookupResult = {
  term: 'hipped roof',
  definition: {
    status: 'found',
    from: 'dictionary',
    note: 'Synonym of hip roof.',
    entries: [{ partOfSpeech: 'noun', senses: ['A roof that slopes down on every side.'] }],
    source: {
      sourceName: 'Wiktionary',
      sourceUrl: 'https://en.wiktionary.org/wiki/hip_roof',
      licence: 'CC BY-SA 4.0',
      licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    },
  },
};

/** Collects CSP violations and page errors. */
function watchViolations(page: Page) {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (message.text().includes('Content Security Policy')) violations.push(message.text());
  });
  page.on('pageerror', (error) => violations.push(error.message));
  return violations;
}

async function lookUpHippedRoof(page: Page, item = 'Definition') {
  const frame = await openLookupBook(page);
  await dragSelect(page, frame, 'hipped', 'roof');
  await lookupMenu(page).getByRole('menuitem', { name: item }).click();
  await expect(lookupModal(page)).toBeVisible();
}

test('CLIENT-9: definitions come from the Worker', async ({ page }) => {
  const violations = watchViolations(page);
  const asked = await fakeWorker(page, () => ({ body: HIPPED_ROOF }));

  await lookUpHippedRoof(page);

  const definition = lookupModal(page).getByRole('region', { name: 'Definition' });
  await expect(definition).toContainText('A roof that slopes down on every side.');
  await expect(definition).toContainText('Synonym of hip roof.');
  await expect(definition.getByRole('link', { name: 'Wiktionary' })).toHaveAttribute(
    'href',
    'https://en.wiktionary.org/wiki/hip_roof',
  );
  expect(asked.map((url) => Object.fromEntries(url.searchParams))).toEqual([
    { term: 'hipped roof', kind: 'definition' },
  ]);
  expect(violations).toEqual([]);
});

test('CLIENT-10: an error offers Retry, which asks again', async ({ page }) => {
  const replies: WorkerReply[] = [{ status: 429, body: { error: 'rate-limited' } }];
  const asked = await fakeWorker(page, () => replies.shift() ?? { body: HIPPED_ROOF });

  await lookUpHippedRoof(page);
  const definition = lookupModal(page).getByRole('region', { name: 'Definition' });
  await expect(definition).toContainText("Couldn't load this. Try again.");
  await definition.getByRole('button', { name: 'Retry' }).click();

  await expect(definition).toContainText('A roof that slopes down on every side.');
  expect(asked).toHaveLength(2);
});

test('MODAL-20: Retry on a failed section asks the Worker for that section alone', async ({
  page,
}) => {
  const asked = await fakeWorker(page, (url) =>
    url.searchParams.get('kind') === 'both'
      ? { body: { ...HIPPED_ROOF, images: { status: 'failed' } } }
      : notFound(url),
  );

  await lookUpHippedRoof(page, 'Both');
  const images = lookupModal(page).getByRole('region', { name: 'Images' });
  const definition = lookupModal(page).getByRole('region', { name: 'Definition' });
  await expect(images).toContainText("Couldn't load this. Try again.");
  await expect(definition).toContainText('A roof that slopes down on every side.');
  await images.getByRole('button', { name: 'Retry' }).click();

  await expect(images).toContainText('No good image found.');
  await expect(definition).toContainText('A roof that slopes down on every side.');
  expect(asked.map((url) => url.searchParams.get('kind'))).toEqual(['both', 'image']);
});

test('CLIENT-11: no more "coming soon"', async ({ page }) => {
  await fakeWorker(page, notFound);

  await lookUpHippedRoof(page, 'Both');

  await expect(lookupModal(page).getByRole('region', { name: 'Images' })).toContainText(
    'No good image found.',
  );
  await expect(lookupModal(page).getByRole('region', { name: 'Definition' })).toContainText(
    'No definition found.',
  );
  await expect(lookupModal(page)).not.toContainText('coming soon');
});
