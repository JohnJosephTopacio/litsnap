// Selection menu acceptance criteria from docs/features/selection-menu.md, against `vite preview`
// (the production build and CSP). Placement rules in detail are unit-tested (placeMenu.test.ts).
import { expect, test, type Frame, type Page } from '@playwright/test';
import { bookFrame } from './book';
import { fixedLayoutEpub } from './fixtures';
import {
  clearSelection,
  dragSelect,
  lookupMenu,
  lookupModal,
  openJekyll,
  openLookupBook,
  scriptSelect,
  selectedText,
  textBoxes,
} from './selection';
import { fakeWorker } from './worker';

// Choosing an item opens the modal, which asks the Worker.
test.beforeEach(async ({ page }) => {
  await fakeWorker(page);
});

/** Negative tests: long enough for a menu that *would* appear (300 ms settle) to appear. */
const settle = (page: Page) => page.waitForTimeout(750);

const bottomBar = (page: Page) => page.getByRole('contentinfo', { name: 'Reading progress' });

/** MENU-4: the menu sits 8 px right of the selection's end, level with its line. */
async function expectBesideEnd(page: Page, frame: Frame, from: string, to = from) {
  const { last } = await textBoxes(frame, from, to);
  const menu = await lookupMenu(page).boundingBox();
  expect(menu).not.toBeNull();
  if (!menu) return;
  expect(menu.x - last.right).toBeCloseTo(8, 0);
  expect(menu.y - last.top).toBeCloseTo(0, 0);
}

test.describe('appearing', () => {
  test('MENU-1: a mouse selection of 1–6 words shows the menu on release', async ({ page }) => {
    const frame = await openLookupBook(page);

    await dragSelect(page, frame, 'hipped', 'roof', { release: false });
    await settle(page);
    await expect(lookupMenu(page)).toBeHidden();

    await page.mouse.up();
    await expect(lookupMenu(page)).toBeVisible();
    await expect(lookupMenu(page).getByRole('menuitem')).toHaveText([
      'DefinitionD',
      'ImageI',
      'BothB',
    ]);
    expect(await selectedText(frame)).toBe('hipped roof');
  });

  test('MENU-2: 7 or more words show no menu, and a growing selection loses it', async ({
    page,
  }) => {
    const frame = await openLookupBook(page);

    await dragSelect(page, frame, 'One', 'seven');
    await settle(page);
    await expect(lookupMenu(page)).toBeHidden();

    await clearSelection(frame);
    await dragSelect(page, frame, 'One', 'three');
    await expect(lookupMenu(page)).toBeVisible();
    await scriptSelect(frame, 'One', 'ten');
    await expect(lookupMenu(page)).toBeHidden();
    await settle(page);
    await expect(lookupMenu(page)).toBeHidden();
  });

  test('MENU-3: a selection made without the mouse shows the menu once it settles', async ({
    page,
  }) => {
    const frame = await openLookupBook(page);
    await scriptSelect(frame, 'two', 'chimneys');
    await expect(lookupMenu(page)).toBeVisible();
    await expectBesideEnd(page, frame, 'two', 'chimneys');
  });

  test('MENU-3: after dragging selected text, other selections still show the menu', async ({
    page,
  }) => {
    const frame = await openLookupBook(page);
    await dragSelect(page, frame, 'hipped', 'roof');
    await expect(lookupMenu(page)).toBeVisible();
    // Pressing on selected text drags the text, which cancels the pointer instead of releasing it.
    const { first } = await textBoxes(frame, 'hipped');
    await page.mouse.move(first.left + 4, (first.top + first.bottom) / 2);
    await page.mouse.down();
    await page.mouse.move(first.left + 120, first.bottom + 60, { steps: 8 });
    await page.mouse.up();

    await clearSelection(frame);
    await scriptSelect(frame, 'two', 'chimneys');
    await expect(lookupMenu(page)).toBeVisible();
  });

  test('MENU-12: selecting text in our own interface shows no menu', async ({ page }) => {
    await openLookupBook(page);
    await page.getByRole('contentinfo', { name: 'Reading progress' }).dblclick();
    await page.getByRole('heading', { level: 1 }).dblclick();
    await settle(page);
    await expect(lookupMenu(page)).toBeHidden();
  });

  test('MENU-13: fixed-layout books show no menu', async ({ page }) => {
    await page.goto('/');
    await page.locator('input[type="file"]').setInputFiles(fixedLayoutEpub());
    const frame = await bookFrame(page, 'A fixed page.');
    await scriptSelect(frame, 'fixed', 'page');
    await settle(page);
    await expect(lookupMenu(page)).toBeHidden();
  });
});

test.describe('placement', () => {
  test('MENU-4: beside the end of the selection, inside the reader area', async ({ page }) => {
    const frame = await openLookupBook(page);
    await dragSelect(page, frame, 'hipped', 'roof');
    await expect(lookupMenu(page)).toBeVisible();
    await expectBesideEnd(page, frame, 'hipped', 'roof');
  });

  test('MENU-14: the scrolled layout too', async ({ page }) => {
    await openLookupBook(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Scrolled' }).click();
    await page.getByRole('button', { name: 'Settings' }).click(); // close the panel

    const scrolled = await bookFrame(page, 'hipped roof');
    await dragSelect(page, scrolled, 'hipped', 'roof');
    await expect(lookupMenu(page)).toBeVisible();
    await expectBesideEnd(page, scrolled, 'hipped', 'roof');
  });
});

test.describe('choosing', () => {
  test('MENU-7: D, I and B open the modal for that kind; without a menu they do nothing', async ({
    page,
  }) => {
    const frame = await openLookupBook(page);
    // The kind shows in the Google link: Google Images (udm=2) only for Image (MODAL-4).
    for (const [key, images] of [
      ['d', false],
      ['I', true],
      ['b', false],
    ] as const) {
      await dragSelect(page, frame, 'hipped', 'roof');
      await expect(lookupMenu(page)).toBeVisible();
      await page.keyboard.press(key);
      await expect(lookupMenu(page)).toBeHidden();
      await expect(lookupModal(page)).toBeVisible();
      const href = await lookupModal(page)
        .getByRole('link', { name: 'Search Google ↗' })
        .getAttribute('href');
      expect(href?.includes('udm=2')).toBe(images);
      await page.keyboard.press('Escape');
      await expect(lookupModal(page)).toBeHidden();
    }

    await page.keyboard.press('d');
    await settle(page);
    await expect(lookupMenu(page)).toBeHidden();
    await expect(lookupModal(page)).toBeHidden();
  });

  test('MENU-7: Ctrl+D is not a shortcut', async ({ page }) => {
    const frame = await openLookupBook(page);
    await dragSelect(page, frame, 'hipped', 'roof');
    await expect(lookupMenu(page)).toBeVisible();
    await page.keyboard.press('Control+i');
    await expect(lookupMenu(page)).toBeVisible();
  });

  test('MENU-11: no focus on appearing; Tab, arrows and Enter work the menu', async ({ page }) => {
    const frame = await openLookupBook(page);
    await dragSelect(page, frame, 'hipped', 'roof');
    await expect(lookupMenu(page)).toBeVisible();
    await expect(lookupMenu(page).getByRole('menuitem', { name: 'Definition' })).not.toBeFocused();

    await page.keyboard.press('Tab');
    await expect(lookupMenu(page).getByRole('menuitem', { name: 'Definition' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(lookupMenu(page).getByRole('menuitem', { name: 'Image' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(lookupMenu(page)).toBeHidden();
    await expect(lookupModal(page)).toBeVisible();
    await expect(lookupModal(page).getByRole('link', { name: 'Search Google ↗' })).toHaveAttribute(
      'href',
      /udm=2/,
    );
  });
});

test.describe('going away', () => {
  test('MENU-8: Esc closes the menu and keeps the selection; a second Esc closes a panel', async ({
    page,
  }) => {
    const frame = await openLookupBook(page);
    await page.getByRole('button', { name: 'Contents' }).click();
    const toc = page.getByRole('navigation', { name: 'Table of contents' });
    await expect(toc).toBeVisible();

    await scriptSelect(frame, 'hipped', 'roof');
    await expect(lookupMenu(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(lookupMenu(page)).toBeHidden();
    expect(await selectedText(frame)).toBe('hipped roof');
    await expect(toc).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(toc).toBeHidden();
  });

  test('MENU-8: Esc from inside the menu gives the keyboard back to the book', async ({ page }) => {
    const frame = await openJekyll(page);
    await dragSelect(page, frame, 'rugged', 'countenance');
    await expect(lookupMenu(page)).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(lookupMenu(page).getByRole('menuitem', { name: 'Definition' })).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(lookupMenu(page)).toBeHidden();
    // The book's iframe sits in closed shadow roots, so from here focus in it looks like the host.
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.tagName))
      .toBe('FOLIATE-VIEW');
    const before = await bottomBar(page).textContent();
    await page.keyboard.press('ArrowRight');
    await expect(bottomBar(page)).not.toHaveText(before ?? '');
  });

  test('MENU-9: clicking the book clears the selection and closes the menu', async ({ page }) => {
    const frame = await openLookupBook(page);
    await dragSelect(page, frame, 'hipped', 'roof');
    await expect(lookupMenu(page)).toBeVisible();

    const { first } = await textBoxes(frame, 'One');
    await page.mouse.click(first.left + 2, (first.top + first.bottom) / 2);
    await expect(lookupMenu(page)).toBeHidden();
    expect(await selectedText(frame)).toBe('');
  });

  test('MENU-9: clicking our interface closes the menu and keeps the selection', async ({
    page,
  }) => {
    const frame = await openLookupBook(page);
    await dragSelect(page, frame, 'hipped', 'roof');
    await expect(lookupMenu(page)).toBeVisible();

    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(lookupMenu(page)).toBeHidden();
    await expect(page.getByRole('button', { name: 'Scrolled' })).toBeVisible();
    expect(await selectedText(frame)).toBe('hipped roof');
  });

  test('MENU-10: a page turn closes the menu, and it stays closed', async ({ page }) => {
    const frame = await openJekyll(page);
    await dragSelect(page, frame, 'rugged', 'countenance');
    await expect(lookupMenu(page)).toBeVisible();

    await page.keyboard.press('ArrowRight');
    await expect(lookupMenu(page)).toBeHidden();
    await settle(page);
    await expect(lookupMenu(page)).toBeHidden();
  });

  test('MENU-10: resizing counts as the book moving', async ({ page }) => {
    const frame = await openLookupBook(page);
    await dragSelect(page, frame, 'hipped', 'roof');
    await expect(lookupMenu(page)).toBeVisible();

    const size = page.viewportSize();
    await page.setViewportSize({
      width: (size?.width ?? 1280) - 100,
      height: size?.height ?? 720,
    });
    await expect(lookupMenu(page)).toBeHidden();
    await expect(lookupMenu(page)).toBeVisible();
    await expectBesideEnd(page, frame, 'hipped', 'roof');
  });
});
