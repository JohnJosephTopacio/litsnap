// @vitest-environment node
// Node, not jsdom: fake-indexeddb clones values with Node's structuredClone, which turns jsdom's
// Blob into a plain object. Node's own Blob round-trips correctly, as real browsers' do.
//
// Acceptance criteria STO-1…8 and STO-11…14 from docs/features/book-storage.md.
// RED PHASE: `it` until the implementation PR, which changes only `it` → `it`.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bookId,
  openBookStore,
  StorageFullError,
  type BookStoreOptions,
  type NewBook,
  type PersistentStorage,
} from './bookStore';

let clock = 1_000;
const now = () => clock;

/** A store on a fresh, uniquely named database, with a controllable clock and no storage API. */
function open(options: BookStoreOptions = {}) {
  return openBookStore({ name: `test-${crypto.randomUUID()}`, now, storage: null, ...options });
}

function book(text = 'book bytes', overrides: Partial<NewBook> = {}): NewBook {
  return {
    blob: new Blob([text], { type: 'application/epub+zip' }),
    fileName: 'flying-buttress.epub',
    title: 'Flying Buttresses',
    author: 'A. Mason',
    ...overrides,
  };
}

function fakeStorage(persisted: boolean) {
  return {
    persisted: vi.fn(() => Promise.resolve(persisted)),
    persist: vi.fn(() => Promise.resolve(true)),
  } satisfies PersistentStorage;
}

afterEach(() => {
  vi.restoreAllMocks();
  clock = 1_000;
});

describe('bookId', () => {
  describe('STO-1: book id is a content hash', () => {
    it('is the SHA-256 of the bytes as 64 lowercase hex characters', async () => {
      // Standard SHA-256 test vector for "abc".
      expect(await bookId(new Blob(['abc']))).toBe(
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      );
    });

    it('is equal for identical bytes regardless of file name', async () => {
      const a = new File(['same bytes'], 'a.epub');
      const b = new File(['same bytes'], 'renamed.epub');

      expect(await bookId(a)).toBe(await bookId(b));
    });
  });
});

describe('openBookStore', () => {
  describe('STO-2: save and load a book', () => {
    it('returns the same metadata and identical bytes', async () => {
      const store = await open();
      const saved = await store.saveBook(book());
      const loaded = await store.getBook(saved.id);

      expect(loaded).toMatchObject({
        id: await bookId(book().blob),
        title: 'Flying Buttresses',
        author: 'A. Mason',
        fileName: 'flying-buttress.epub',
        size: 'book bytes'.length,
        addedAt: 1_000,
        lastOpenedAt: 1_000,
      });
      expect(await loaded?.blob.text()).toBe('book bytes');
      expect(loaded?.blob.type).toBe('application/epub+zip');
    });

    it('falls back to the file name when the book has no title', async () => {
      const store = await open();
      const saved = await store.saveBook(book('untitled', { title: '  ' }));

      expect(saved.title).toBe('flying-buttress.epub');
    });

    it('returns undefined for an unknown id', async () => {
      const store = await open();

      expect(await store.getBook('0'.repeat(64))).toBeUndefined();
    });
  });

  describe('STO-3: re-importing the same file keeps progress', () => {
    it('keeps one book, keeps addedAt, updates lastOpenedAt, keeps progress', async () => {
      const store = await open();
      const first = await store.saveBook(book());
      await store.saveProgress(first.id, { cfi: 'epubcfi(/6/8!/4/2)', fraction: 0.3 });

      clock = 5_000;
      const again = await store.saveBook(book('book bytes', { fileName: 'renamed.epub' }));

      expect(again.id).toBe(first.id);
      expect(again.addedAt).toBe(1_000);
      expect(again.lastOpenedAt).toBe(5_000);
      expect(await store.getProgress(first.id)).toMatchObject({ fraction: 0.3 });
    });
  });

  describe('STO-4: storage full', () => {
    it('throws StorageFullError and leaves no partial book', async () => {
      const store = await open();
      // eslint-disable-next-line @typescript-eslint/unbound-method -- re-bound with apply() below
      const realPut = IDBObjectStore.prototype.put;
      vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
        this: IDBObjectStore,
        ...args: Parameters<IDBObjectStore['put']>
      ) {
        if (this.name === 'books') throw new DOMException('Quota exceeded', 'QuotaExceededError');
        return realPut.apply(this, args);
      });

      await expect(store.saveBook(book())).rejects.toBeInstanceOf(StorageFullError);

      vi.restoreAllMocks();
      expect(await store.getBook(await bookId(book().blob))).toBeUndefined();
    });
  });

  describe('STO-5: persistence requested on import', () => {
    it('calls persist() when storage is not yet persisted', async () => {
      const storage = fakeStorage(false);
      const store = await open({ storage });
      await store.saveBook(book());

      expect(storage.persist).toHaveBeenCalledTimes(1);
    });

    it('does not call persist() when already persisted', async () => {
      const storage = fakeStorage(true);
      const store = await open({ storage });
      await store.saveBook(book());

      expect(storage.persist).not.toHaveBeenCalled();
    });

    it('saves normally when the storage API is unavailable', async () => {
      const store = await open({ storage: null });

      await expect(store.saveBook(book())).resolves.toMatchObject({ title: 'Flying Buttresses' });
    });
  });

  describe('STO-6: current book round-trip', () => {
    it('returns the book set last, and keeps the earlier one', async () => {
      const store = await open();
      const a = await store.saveBook(book('book A'));
      const b = await store.saveBook(book('book B'));

      await store.setCurrentBook(a.id);
      await store.setCurrentBook(b.id);

      expect((await store.getCurrentBook())?.id).toBe(b.id);
      expect(await store.getBook(a.id)).toBeDefined();
    });
  });

  describe('STO-7: current book missing', () => {
    it('is undefined when nothing was ever set', async () => {
      const store = await open();

      expect(await store.getCurrentBook()).toBeUndefined();
    });

    it('is undefined (not an error) when the current book is no longer stored', async () => {
      const store = await open();
      await store.setCurrentBook('f'.repeat(64));

      expect(await store.getCurrentBook()).toBeUndefined();
    });
  });

  describe('STO-8: save and load progress', () => {
    it('returns the saved cfi and fraction', async () => {
      const store = await open();
      const saved = await store.saveBook(book());

      clock = 2_000;
      await store.saveProgress(saved.id, { cfi: 'epubcfi(/6/4!/4/10)', fraction: 0.42 });

      expect(await store.getProgress(saved.id)).toEqual({
        bookId: saved.id,
        cfi: 'epubcfi(/6/4!/4/10)',
        fraction: 0.42,
        updatedAt: 2_000,
      });
    });

    it('returns undefined for a book with no saved progress', async () => {
      const store = await open();
      const saved = await store.saveBook(book());

      expect(await store.getProgress(saved.id)).toBeUndefined();
    });
  });

  describe('STO-11: last write wins', () => {
    it('keeps the progress written last by two connections', async () => {
      const name = `test-${crypto.randomUUID()}`;
      const tabA = await openBookStore({ name, now, storage: null });
      const tabB = await openBookStore({ name, now, storage: null });
      const saved = await tabA.saveBook(book());

      await tabA.saveProgress(saved.id, { cfi: 'epubcfi(/6/2!/4/2)', fraction: 0.1 });
      await tabB.saveProgress(saved.id, { cfi: 'epubcfi(/6/20!/4/2)', fraction: 0.9 });

      expect(await tabA.getProgress(saved.id)).toMatchObject({ fraction: 0.9 });
    });
  });

  describe('STO-12: defaults', () => {
    it('is 100%, paginated, and follows the OS theme', async () => {
      const store = await open();

      expect(await store.getSettings()).toEqual({
        fontSize: 100,
        layout: 'paginated',
        theme: undefined,
      });
    });
  });

  describe('STO-13: font size limits', () => {
    it.each([
      [73, 80],
      [80, 80],
      [114, 110],
      [115, 120],
      [200, 200],
      [205, 200],
    ])('saves %d as %d', async (requested, stored) => {
      const store = await open();
      await store.updateSettings({ fontSize: requested });

      expect((await store.getSettings()).fontSize).toBe(stored);
    });
  });

  describe('STO-14: settings persist', () => {
    it('survives closing and reopening the database', async () => {
      const name = `test-${crypto.randomUUID()}`;
      const first = await openBookStore({ name, now, storage: null });
      await first.updateSettings({ theme: 'dark' });
      await first.updateSettings({ layout: 'scrolled' });
      first.close();

      const second = await openBookStore({ name, now, storage: null });

      expect(await second.getSettings()).toEqual({
        fontSize: 100,
        theme: 'dark',
        layout: 'scrolled',
      });
    });

    it('can go back to following the OS theme', async () => {
      const store = await open();
      await store.updateSettings({ theme: 'light' });
      await store.updateSettings({ theme: undefined });

      expect((await store.getSettings()).theme).toBeUndefined();
    });
  });
});
