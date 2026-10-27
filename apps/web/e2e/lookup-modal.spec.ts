// Lookup modal acceptance criteria from docs/features/lookup-modal.md, against `vite preview` (the
// production build), with the Worker faked to find nothing. The definition section, loading,
// errors and Retry are tested against the mock client in LookupModal.test.tsx; definitions from
// the Worker in lookup-client.spec.ts.
import { expect, test, type Frame, type Page } from '@playwright/test';
import {
  dragSelect,
  lookupMenu,
  lookupModal,
  openJekyll,
  openLookupBook,
  selectedText,
} from './selection';
import { storedSetting } from './storage';
import { fakeWorker } from './worker';

test.beforeEach(async ({ page }) => {
  await fakeWorker(page);
});

const bottomBar = (page: Page) => page.getByRole('contentinfo', { name: 'Reading progress' });
const googleLink = (page: Page) => lookupModal(page).getByRole('link', { name: 'Search Google ↗' });

/** Selects `from`…`to`, then chooses `item` from the menu. */
async function lookUp(page: Page, frame: Frame, from: string, to = from, item = 'Definition') {
  await dragSelect(page, frame, from, to);
  await lookupMenu(page).getByRole('menuitem', { name: item }).click();
  await expect(lookupModal(page)).toBeVisible();
}

async function modalWidth(page: Page) {
  return (await lookupModal(page).boundingBox())?.width ?? 0;
}

test.describe('opening', () => {
  test('MODAL-1: choosing opens a centred modal; the selection stays underneath', async ({
    page,
  }) => {
    const frame = await openLookupBook(page);
    await lookUp(page, frame, 'hipped', 'roof');

    await expect(lookupMenu(page)).toBeHidden();
    const box = await lookupModal(page).boundingBox();
    const viewport = page.viewportSize();
    expect(box && viewport).toBeTruthy();
    if (!box || !viewport) return;
    expect(box.width).toBeLessThan(viewport.width);
    expect(box.x + box.width / 2).toBeCloseTo(viewport.width / 2, 0);
    expect(await selectedText(frame)).toBe('hipped roof');
  });

  test('MODAL-1: the menu stays away while the modal is open, even if the book moves', async ({
    page,
  }) => {
    const frame = await openLookupBook(page);
    await lookUp(page, frame, 'hipped', 'roof');
    // A resize re-lays out the book; with the selection still there, the menu would come back.
    await page.setViewportSize({ width: 1200, height: 700 });
    await page.waitForTimeout(750);
    await expect(lookupMenu(page)).toBeHidden();
    await expect(lookupModal(page)).toBeVisible();
  });

  test('MODAL-2: the display term, and the sentence with the selection marked', async ({
    page,
  }) => {
    const frame = await openLookupBook(page);
    await lookUp(page, frame, 'The', 'house');

    await expect(lookupModal(page)).toHaveAccessibleName('The house');
    await expect(lookupModal(page).getByRole('heading', { level: 2 })).toHaveText('The house');
    await expect(lookupModal(page).locator('.lookup-sentence')).toHaveText(
      'The house had a hipped roof and two chimneys.',
    );
    await expect(lookupModal(page).locator('mark')).toHaveText('The house');
  });

  test('MODAL-2: markup in the book is shown as text', async ({ page }) => {
    const frame = await openLookupBook(page);
    await lookUp(page, frame, '<img', '1)">');

    await expect(lookupModal(page).getByRole('heading', { level: 2 })).toContainText('onerror');
    await expect(lookupModal(page).locator('img')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('pwned-modal'))).toBeNull();
  });
});

test.describe('content', () => {
  test('MODAL-4: Search Google ↗ searches the lookup term in a new tab', async ({ page }) => {
    const frame = await openLookupBook(page);
    await lookUp(page, frame, 'hipped', 'roof');
    await expect(googleLink(page)).toHaveAttribute(
      'href',
      'https://www.google.com/search?q=hipped+roof',
    );
    await expect(googleLink(page)).toHaveAttribute('target', '_blank');
    await expect(googleLink(page)).toHaveAttribute('rel', 'noopener noreferrer');
  });
});

test.describe('size', () => {
  test('MODAL-12: S/M/L set the width, and the choice is kept after a reload', async ({ page }) => {
    const frame = await openLookupBook(page);
    await lookUp(page, frame, 'hipped', 'roof');
    await expect(lookupModal(page).getByRole('button', { name: 'Medium' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(await modalWidth(page)).toBeCloseTo(640, 0); // 40rem

    await lookupModal(page).getByRole('button', { name: 'Large' }).click();
    await expect.poll(() => modalWidth(page)).toBeCloseTo(896, 0); // 56rem
    await lookupModal(page).getByRole('button', { name: 'Small' }).click();
    await expect.poll(() => modalWidth(page)).toBeCloseTo(448, 0); // 28rem
    await lookupModal(page).getByRole('button', { name: 'Large' }).click();
    await expect.poll(() => storedSetting(page, 'lookupSize')).toBe('l');

    await page.reload();
    const reopened = await openLookupBook(page);
    await lookUp(page, reopened, 'hipped', 'roof');
    await expect(lookupModal(page).getByRole('button', { name: 'Large' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(await modalWidth(page)).toBeCloseTo(896, 0);
  });

  test('MODAL-13: the same setting is in the Settings panel', async ({ page }) => {
    const frame = await openLookupBook(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    const panel = page.getByRole('group', { name: 'Lookup size' });
    await expect(panel.getByRole('button', { name: 'Medium' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await panel.getByRole('button', { name: 'Small' }).click();
    await page.getByRole('button', { name: 'Settings' }).click();

    await lookUp(page, frame, 'hipped', 'roof');
    await expect(lookupModal(page).getByRole('button', { name: 'Small' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(await modalWidth(page)).toBeCloseTo(448, 0);
  });

  test('MODAL-14: narrow windows get the full width', async ({ page }) => {
    await page.setViewportSize({ width: 500, height: 800 });
    const frame = await openLookupBook(page);
    await lookUp(page, frame, 'hipped', 'roof');
    expect(await modalWidth(page)).toBeCloseTo(500 - 16, 0);
  });
});

test.describe('closing', () => {
  test('MODAL-15: Esc, the backdrop and Close close it; clicks inside do not', async ({ page }) => {
    const frame = await openLookupBook(page);

    await lookUp(page, frame, 'hipped', 'roof');
    await page.keyboard.press('Escape');
    await expect(lookupModal(page)).toBeHidden();

    await lookUp(page, frame, 'hipped', 'roof');
    await lookupModal(page).getByRole('heading', { level: 2 }).click();
    await lookupModal(page).locator('.lookup-sentence').click();
    await expect(lookupModal(page)).toBeVisible();
    // Pressing inside and releasing on the backdrop (selecting text, say) keeps it open.
    const sentence = await lookupModal(page).locator('.lookup-sentence').boundingBox();
    if (!sentence) throw new Error('no sentence');
    await page.mouse.move(sentence.x + 4, sentence.y + sentence.height / 2);
    await page.mouse.down();
    await page.mouse.move(5, 5, { steps: 5 });
    await page.mouse.up();
    await expect(lookupModal(page)).toBeVisible();
    await page.mouse.click(5, 5); // the dimmed backdrop, outside the modal
    await expect(lookupModal(page)).toBeHidden();

    await lookUp(page, frame, 'hipped', 'roof');
    await lookupModal(page).getByRole('button', { name: 'Close' }).click();
    await expect(lookupModal(page)).toBeHidden();
  });

  test('MODAL-16: focus starts on Close, and Tab never reaches the page behind', async ({
    page,
  }) => {
    const frame = await openLookupBook(page);
    await lookUp(page, frame, 'hipped', 'roof');
    await expect(lookupModal(page).getByRole('button', { name: 'Close' })).toBeFocused();

    // Past the last control, focus may leave for the browser's toolbar (activeElement = <body>),
    // but it must never land on anything else in the page.
    const where = () =>
      page.evaluate(() => {
        const active = document.activeElement;
        if (!active || active === document.body) return 'outside the page';
        return active.closest('dialog') ? 'in the modal' : active.tagName;
      });
    const seen = new Set<string>();
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      seen.add(await where());
    }
    expect([...seen].filter((place) => place !== 'outside the page')).toEqual(['in the modal']);
  });

  test('MODAL-17: closing clears the selection and gives the keyboard back to the book', async ({
    page,
  }) => {
    const frame = await openJekyll(page);
    await lookUp(page, frame, 'rugged', 'countenance');
    await page.keyboard.press('Escape');
    await expect(lookupModal(page)).toBeHidden();

    // Esc hides the dialog at once, but its `close` event, which clears the selection, comes a
    // task later; CI once read the selection 10 ms after Esc, in between.
    await expect.poll(() => selectedText(frame)).toBe('');
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.tagName))
      .toBe('FOLIATE-VIEW');
    const before = await bottomBar(page).textContent();
    await page.keyboard.press('ArrowRight');
    await expect(bottomBar(page)).not.toHaveText(before ?? '');
  });

  test("MODAL-18: the reader's keys are off while it's open", async ({ page }) => {
    const frame = await openJekyll(page);
    await lookUp(page, frame, 'rugged', 'countenance');
    const progress = await bottomBar(page).textContent();
    const href = await googleLink(page).getAttribute('href');

    for (const key of ['ArrowRight', 'PageDown', 'i', 'b']) await page.keyboard.press(key);
    await page.waitForTimeout(750);

    await expect(bottomBar(page)).toHaveText(progress ?? '');
    await expect(lookupModal(page)).toBeVisible();
    await expect(googleLink(page)).toHaveAttribute('href', href ?? '');
  });
});
