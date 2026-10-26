// Selecting text in the book like a reader would, for the selection menu and the lookup modal.
import { expect, type Frame, type Page } from '@playwright/test';
import { bookFrame } from './book';
import { JEKYLL, JEKYLL_TITLE, lookupEpub } from './fixtures';

/** The generated lookup book (fixtures.ts), open, with its frame. */
export async function openLookupBook(page: Page): Promise<Frame> {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(lookupEpub());
  return bookFrame(page, 'hipped roof');
}

/** Jekyll at the first page of "Story of the Door", for page turns. */
export async function openJekyll(page: Page): Promise<Frame> {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(JEKYLL);
  await expect(page.getByRole('heading', { level: 1, name: JEKYLL_TITLE })).toBeVisible();
  await page.getByRole('button', { name: 'Contents' }).click();
  await page
    .getByRole('navigation', { name: 'Table of contents' })
    .getByText('Story of the Door')
    .click();
  return bookFrame(page, 'rugged countenance');
}

export const lookupMenu = (page: Page) => page.getByRole('menu', { name: 'Look up' });

/** The lookup modal (lookup-modal.md). */
export const lookupModal = (page: Page) => page.getByRole('dialog');

export interface PageBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * In the book's iframe: finds `from`…`to` (each inside one text node, enough for our fixtures),
 * optionally selects it by script, and returns its first and last line in iframe coordinates. One
 * self-contained function, because Playwright sends it into the frame as source text.
 */
const findInBook = ([from, to, select]: readonly [string, string, boolean]) => {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let started = false;
  let found = false;
  for (
    let node = walker.nextNode() as Text | null;
    node && !found;
    node = walker.nextNode() as Text | null
  ) {
    const searchFrom = started ? 0 : node.data.indexOf(from);
    if (searchFrom < 0) continue;
    if (!started) range.setStart(node, searchFrom);
    started = true;
    const end = node.data.indexOf(to, searchFrom);
    if (end >= 0) {
      range.setEnd(node, end + to.length);
      found = true;
    }
  }
  if (!found) throw new Error(`"${from}"…"${to}" isn't in the book`);
  if (select) {
    document
      .getSelection()
      ?.setBaseAndExtent(
        range.startContainer,
        range.startOffset,
        range.endContainer,
        range.endOffset,
      );
  }
  const lines = [...range.getClientRects()].filter((rect) => rect.width > 0);
  const box = (rect: DOMRect | undefined) =>
    rect && { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
  return { first: box(lines[0]), last: box(lines.at(-1)) };
};

/** The first and last line of `from`…`to`, in page coordinates. */
export async function textBoxes(
  frame: Frame,
  from: string,
  to = from,
  select = false,
): Promise<{ first: PageBox; last: PageBox }> {
  const inFrame = await frame.evaluate(findInBook, [from, to, select] as const);
  const frameBox = await (await frame.frameElement()).boundingBox();
  if (!inFrame.first || !inFrame.last || !frameBox) throw new Error('text not laid out');
  const shift = (b: PageBox) => ({
    left: b.left + frameBox.x,
    top: b.top + frameBox.y,
    right: b.right + frameBox.x,
    bottom: b.bottom + frameBox.y,
  });
  return { first: shift(inFrame.first), last: shift(inFrame.last) };
}

/** Drags the mouse from the start of `from` to the end of `to`; releases unless told not to. */
export async function dragSelect(
  page: Page,
  frame: Frame,
  from: string,
  to = from,
  { release = true } = {},
) {
  const { first, last } = await textBoxes(frame, from, to);
  await page.mouse.move(first.left + 1, (first.top + first.bottom) / 2);
  await page.mouse.down();
  await page.mouse.move(last.right - 1, (last.top + last.bottom) / 2, { steps: 8 });
  if (release) await page.mouse.up();
}

/** Selects `from`…`to` by script, with no pointer involved (like a keyboard selection). */
export async function scriptSelect(frame: Frame, from: string, to = from) {
  await textBoxes(frame, from, to, true);
}

/** The book's current selection, as text. */
export const selectedText = (frame: Frame) =>
  frame.evaluate(() => document.getSelection()?.toString() ?? '');

/** Clears the book's selection, so the next drag starts a new one (pressing on selected text drags it). */
export const clearSelection = (frame: Frame) =>
  frame.evaluate(() => {
    document.getSelection()?.removeAllRanges();
  });
