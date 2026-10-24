// Reads and edits LitSnap's IndexedDB from Playwright, to check what was saved and to set up
// states that are hard to reach by clicking (a stale position, a missing or broken book).
import type { Page } from '@playwright/test';

export interface Stored {
  titles: string[];
  current: { title: string } | undefined;
}

/** What LitSnap has saved: book titles and the current book. */
export function stored(page: Page): Promise<Stored> {
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

/** Saved progress of the current book, or undefined. */
export function currentProgress(
  page: Page,
): Promise<{ cfi: string; fraction: number } | undefined> {
  return page.evaluate(
    () =>
      new Promise<{ cfi: string; fraction: number } | undefined>((resolve, reject) => {
        const request = indexedDB.open('litsnap');
        request.onerror = () => {
          reject(request.error ?? new Error('open failed'));
        };
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(['settings', 'progress']);
          const id = tx.objectStore('settings').get('currentBookId');
          id.onsuccess = () => {
            const progress = tx.objectStore('progress').get(id.result as string);
            progress.onsuccess = () => {
              resolve(progress.result as { cfi: string; fraction: number } | undefined);
              db.close();
            };
          };
        };
      }),
  );
}

/**
 * One write to LitSnap's database, about the current book:
 * - `books`: merges `value` into the current book's record (`brokenBlob` swaps in junk bytes)
 * - `progress`: stores `value` as the current book's progress
 * - `settings`: puts `value` under `options.key`
 */
export function write(
  page: Page,
  store: 'books' | 'progress' | 'settings',
  value: Record<string, unknown> | string,
  options: { key?: string; brokenBlob?: boolean } = {},
): Promise<void> {
  return page.evaluate(
    ({ store, value, options }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('litsnap');
        request.onerror = () => {
          reject(request.error ?? new Error('open failed'));
        };
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(['settings', store], 'readwrite');
          const currentId = tx.objectStore('settings').get('currentBookId');
          currentId.onsuccess = () => {
            const id = currentId.result as string;
            if (store === 'books') {
              const book = tx.objectStore('books').get(id);
              book.onsuccess = () => {
                const record = { ...(book.result as object), ...(value as object) };
                if (options.brokenBlob) {
                  Object.assign(record, { blob: new Blob(['not an EPUB any more']) });
                }
                tx.objectStore('books').put(record);
              };
            } else if (store === 'progress') {
              tx.objectStore('progress').put({ ...(value as object), bookId: id });
            } else {
              tx.objectStore('settings').put(value, options.key);
            }
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            reject(tx.error ?? new Error('write failed'));
          };
        };
      }),
    { store, value, options },
  );
}

/**
 * A stored setting (`fontSize`, `theme`, `layout`). The app saves settings in the background, so
 * a test that reloads right after changing one must wait for this first: a person can't reload
 * within milliseconds of clicking, but a test can.
 */
export function storedSetting(page: Page, key: string): Promise<unknown> {
  return page.evaluate(
    (key) =>
      new Promise<unknown>((resolve, reject) => {
        const request = indexedDB.open('litsnap');
        request.onerror = () => {
          reject(request.error ?? new Error('open failed'));
        };
        request.onsuccess = () => {
          const db = request.result;
          const get = db.transaction('settings').objectStore('settings').get(key);
          get.onsuccess = () => {
            resolve(get.result);
            db.close();
          };
        };
      }),
    key,
  );
}

/** Resolves once the app has created its database (it does so on startup). */
export async function databaseReady(page: Page) {
  await page.waitForFunction(async () =>
    (await indexedDB.databases()).some((db) => db.name === 'litsnap'),
  );
}
