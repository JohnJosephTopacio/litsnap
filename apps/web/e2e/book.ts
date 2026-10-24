// Reaching into the rendered book. foliate renders each section in an iframe (from a blob: URL)
// inside closed shadow roots, so tests find it through page.frames().
import { expect, type Frame, type Page } from '@playwright/test';

/** The book iframe once it shows `text`. */
export async function bookFrame(page: Page, text: string): Promise<Frame> {
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
