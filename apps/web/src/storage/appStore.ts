// The app's one connection to IndexedDB, opened on first use and shared.
import { openBookStore, type BookStore } from './bookStore';

let store: Promise<BookStore> | undefined;

export function appStore(): Promise<BookStore> {
  store ??= openBookStore();
  return store;
}
