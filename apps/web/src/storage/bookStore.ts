// Books, reading progress and settings in IndexedDB. Nothing here ever leaves the device.
// Spec: docs/features/book-storage.md.
import { openDB, type DBSchema } from 'idb';

export type Theme = 'light' | 'dark';
export type Layout = 'paginated' | 'scrolled';

export interface Settings {
  /** Percent, 80–200 in steps of 10. */
  fontSize: number;
  /** `undefined` = follow the OS (`prefers-color-scheme`). */
  theme: Theme | undefined;
  layout: Layout;
}

export interface Position {
  /** foliate's location string. */
  cfi: string;
  /** 0–1 through the whole book; fallback when `cfi` no longer resolves. */
  fraction: number;
}

export interface StoredProgress extends Position {
  bookId: string;
  updatedAt: number;
}

export interface NewBook {
  blob: Blob;
  fileName: string;
  /** From the book's metadata; empty falls back to `fileName`. */
  title: string;
  author: string;
}

export interface StoredBook {
  /** SHA-256 of the file bytes, lowercase hex. */
  id: string;
  title: string;
  author: string;
  fileName: string;
  size: number;
  blob: Blob;
  addedAt: number;
  lastOpenedAt: number;
}

/** The subset of `navigator.storage` we use. */
export interface PersistentStorage {
  persisted(): Promise<boolean>;
  persist(): Promise<boolean>;
}

export interface BookStoreOptions {
  /** Database name. Default `litsnap`; tests pass unique names. */
  name?: string;
  /** Clock for `addedAt` / `lastOpenedAt` / `updatedAt`. Default `Date.now`. */
  now?: () => number;
  /** Default `navigator.storage`; `null` = the API isn't available. */
  storage?: PersistentStorage | null;
}

export interface BookStore {
  /** Saves (or re-saves) a book and requests persistent storage. Throws `StorageFullError`. */
  saveBook(book: NewBook): Promise<StoredBook>;
  getBook(id: string): Promise<StoredBook | undefined>;
  setCurrentBook(id: string): Promise<void>;
  /** `undefined` when no book is current, or the current book is no longer stored. */
  getCurrentBook(): Promise<StoredBook | undefined>;
  saveProgress(bookId: string, position: Position): Promise<void>;
  getProgress(bookId: string): Promise<StoredProgress | undefined>;
  getSettings(): Promise<Settings>;
  /** Merges `patch` into the stored settings (clamping `fontSize`) and returns the result. */
  updateSettings(patch: Partial<Settings>): Promise<Settings>;
  close(): void;
}

export class StorageFullError extends Error {
  constructor(options?: { cause?: unknown }) {
    super('Not enough browser storage to save this book.', options);
    this.name = 'StorageFullError';
  }
}

interface LitsnapDB extends DBSchema {
  books: { key: string; value: StoredBook };
  progress: { key: string; value: StoredProgress };
  // Key/value pairs: `fontSize`, `theme`, `layout`, `currentBookId`.
  settings: { key: string; value: unknown };
}

const DEFAULT_SETTINGS: Settings = { fontSize: 100, theme: undefined, layout: 'paginated' };

/** 80–200, rounded to the nearest 10. */
const clampFontSize = (size: number) => Math.min(200, Math.max(80, Math.round(size / 10) * 10));

const isQuotaError = (error: unknown) =>
  error instanceof DOMException && error.name === 'QuotaExceededError';

/** SHA-256 of the blob's bytes, as 64 lowercase hex characters. */
export async function bookId(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function openBookStore(options: BookStoreOptions = {}): Promise<BookStore> {
  const now = options.now ?? Date.now;
  const storage =
    options.storage === undefined
      ? ((navigator.storage as StorageManager | undefined) ?? null)
      : options.storage;

  const db = await openDB<LitsnapDB>(options.name ?? 'litsnap', 1, {
    upgrade(database, oldVersion) {
      // Each future schema version adds its own `if (oldVersion < N)` step, so a browser on any
      // older version upgrades through every step in order.
      if (oldVersion < 1) {
        database.createObjectStore('books', { keyPath: 'id' });
        database.createObjectStore('progress', { keyPath: 'bookId' });
        database.createObjectStore('settings');
      }
    },
  });

  async function requestPersistence() {
    if (!storage) return;
    try {
      if (!(await storage.persisted())) await storage.persist();
    } catch {
      // Best effort: without persistence the browser may evict data under storage pressure,
      // but saving still worked.
    }
  }

  async function getSettings(): Promise<Settings> {
    const [fontSize, theme, layout] = await Promise.all([
      db.get('settings', 'fontSize'),
      db.get('settings', 'theme'),
      db.get('settings', 'layout'),
    ]);
    // Validate what we read back: stored data outlives the code that wrote it.
    return {
      fontSize: typeof fontSize === 'number' ? clampFontSize(fontSize) : DEFAULT_SETTINGS.fontSize,
      theme: theme === 'light' || theme === 'dark' ? theme : DEFAULT_SETTINGS.theme,
      layout: layout === 'paginated' || layout === 'scrolled' ? layout : DEFAULT_SETTINGS.layout,
    };
  }

  return {
    async saveBook(book) {
      const id = await bookId(book.blob);
      const existing = await db.get('books', id);
      const time = now();
      const stored: StoredBook = {
        id,
        title: book.title.trim() || book.fileName,
        author: book.author,
        fileName: book.fileName,
        size: book.blob.size,
        blob: book.blob,
        addedAt: existing?.addedAt ?? time,
        lastOpenedAt: time,
      };

      const tx = db.transaction('books', 'readwrite');
      try {
        await Promise.all([tx.store.put(stored), tx.done]);
      } catch (error) {
        // Browsers report a full disk either by throwing from put() or, more often, by aborting
        // the transaction at commit time, with the reason on `tx.error`. An aborted transaction
        // writes nothing, so there's no partial book to clean up.
        if (isQuotaError(error) || isQuotaError(tx.error)) {
          throw new StorageFullError({ cause: error });
        }
        throw error;
      }

      await requestPersistence();
      return stored;
    },

    getBook: (id) => db.get('books', id),

    async setCurrentBook(id) {
      await db.put('settings', id, 'currentBookId');
    },

    async getCurrentBook() {
      const id = await db.get('settings', 'currentBookId');
      return typeof id === 'string' ? db.get('books', id) : undefined;
    },

    async saveProgress(bookId, { cfi, fraction }) {
      await db.put('progress', { bookId, cfi, fraction, updatedAt: now() });
    },

    getProgress: (id) => db.get('progress', id),

    getSettings,

    async updateSettings(patch) {
      const tx = db.transaction('settings', 'readwrite');
      const writes: Promise<unknown>[] = [];
      if (patch.fontSize !== undefined) {
        writes.push(tx.store.put(clampFontSize(patch.fontSize), 'fontSize'));
      }
      if ('theme' in patch) {
        // `theme: undefined` means "follow the OS again", so remove the stored choice.
        writes.push(patch.theme ? tx.store.put(patch.theme, 'theme') : tx.store.delete('theme'));
      }
      if (patch.layout !== undefined) writes.push(tx.store.put(patch.layout, 'layout'));
      await Promise.all([...writes, tx.done]);
      return getSettings();
    },

    close() {
      db.close();
    },
  };
}
