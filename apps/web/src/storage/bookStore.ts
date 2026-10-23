// Books, reading progress and settings in IndexedDB. Nothing here ever leaves the device.
// Spec: docs/features/book-storage.md.

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

// RED PHASE: stubs until the implementation PR.
const notImplemented = (name: string): Promise<never> =>
  Promise.reject(new Error(`${name} is not implemented yet`));

/** SHA-256 of the blob's bytes, as 64 lowercase hex characters. */
export const bookId: (blob: Blob) => Promise<string> = () => notImplemented('bookId');

export const openBookStore: (options?: BookStoreOptions) => Promise<BookStore> = () =>
  notImplemented('openBookStore');
