# Feature: Book storage

> Milestone: M1 · Status: done · Product spec: [spec.md §6–7](../spec.md#7-privacy--data)

## Goal

Keep books, reading progress and reader settings in the browser (IndexedDB, via `idb`). Reopening LitSnap then brings the reader back to the same book and position. Nothing here ever leaves the device.

## Data model

Database `litsnap`, schema version **1**:

| Store      | Key      | Value                                                                                                                                                                                                                    |
| ---------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `books`    | `id`     | `{ id, title, author, fileName, size, blob, addedAt, lastOpenedAt }`                                                                                                                                                     |
| `progress` | `bookId` | `{ bookId, cfi, fraction, updatedAt }`                                                                                                                                                                                   |
| `settings` | key      | `fontSize` (number, %), `theme` (`'light' \| 'dark'`, unset = follow OS), `layout` (`'paginated' \| 'scrolled'`), `lookupSize` (`'s' \| 'm' \| 'l'`, [lookup-modal](lookup-modal.md) MODAL-12), `controls` (`'auto-hide' | 'always'`, [reader-chrome](reader-chrome.md) CHROME-11, STO-17), `currentBookId`, `leftAtStart` (STO-16) |

- `id` is the **SHA-256 of the file bytes** (hex, via Web Crypto). The same file always gets the same id, even if it is renamed.
- `title` and `author` come from the book's metadata (foliate), and fall back to `fileName` and `''`.
- `cfi` is foliate's location string. `fraction` (0–1) is the position through the whole book, used as a fallback and for display.
- Covers aren't stored. The M6 library can extract them from `blob`.

## Acceptance criteria

### Books

**STO-1: book id is a content hash**
Given two files with identical bytes but different names
When their ids are computed
Then both ids are equal, and are the 64-character hex SHA-256 of the bytes.

**STO-2: save and load a book**
Given a book has been saved
When it is loaded by id
Then the same metadata and an identical blob are returned.

**STO-3: re-importing the same file keeps progress**
Given a saved book with saved progress
When the same file is saved again
Then there is still one book with that id, its `addedAt` is unchanged, its `lastOpenedAt` is updated, and its progress is untouched.

**STO-4: storage full**
Given IndexedDB rejects a write with `QuotaExceededError`
When a book is saved
Then saving fails with a `StorageFullError` and nothing partial is left in the `books` store.

**STO-5: persistence requested on import**
Given `navigator.storage.persisted()` resolves `false`
When a book is saved
Then `navigator.storage.persist()` is called. If it is already persisted, or the API doesn't exist, nothing is called and nothing throws.

### Current book

**STO-6: current book round-trip**
Given book A was set as current, then book B
When the current book is read
Then it is B, and A is still stored.

**STO-7: current book missing**
Given `currentBookId` points to a book that is no longer stored
When the current book is read
Then the result is "no current book" (not an error).

### Progress

**STO-8: save and load progress**
Given progress `{ cfi, fraction }` was saved for a book
When progress is loaded for that book
Then the same `cfi` and `fraction` are returned. A book with no saved progress returns nothing.

**STO-9: progress writes are debounced**
Given a progress saver with a 1 s debounce
When five positions are reported within 1 s
Then exactly one write happens, 1 s after the last report, with the last position.

**STO-10: pending progress is flushed**
Given a position was reported less than 1 s ago and hasn't been written
When the saver is flushed (the reader calls this when the page becomes hidden)
Then the pending position is written immediately, and isn't written a second time later.

**STO-11: last write wins**
Given two writers save progress for the same book
When both writes complete
Then the stored progress is the one written last (no merging, no cross-tab sync).

### Settings

**STO-12: defaults**
Given nothing has been stored
When settings are read
Then `fontSize` is `100`, `layout` is `'paginated'`, and `theme` is unset (follow OS).

**STO-13: font size limits**
Given any requested font size
When it is saved
Then it is clamped to 80–200 and rounded to the nearest 10.

**STO-14: settings persist**
Given the theme was set to `'dark'` and layout to `'scrolled'`
When settings are read in a fresh session (new `idb` connection)
Then they are `'dark'` and `'scrolled'`.

**STO-15: lookup size** (added with [lookup-modal](lookup-modal.md))
Given nothing has been stored, or a value other than `'s'`, `'m'` or `'l'`
When settings are read
Then `lookupSize` is `'m'`. After it is set to `'l'`, it reads `'l'`, including in a fresh session.

**STO-16: where the reader left** (added with the start screen, [epub-reader](epub-reader.md) RD-31)
Given nothing has been stored
When `getLeftAtStart()` is read
Then it is `false`, so installs from before M4.5 keep going straight into the book (RD-8). After `setLeftAtStart(true)` it reads `true`, including in a fresh session, and `setLeftAtStart(false)` puts it back. The current book is untouched either way.

**STO-17: controls** (added with [reader-chrome](reader-chrome.md) CHROME-11)
Given nothing has been stored (including settings saved before this one existed), or a value other than `'auto-hide'` or `'always'`
When settings are read
Then `controls` is `'auto-hide'`. After it is set to `'always'`, it reads `'always'`, including in a fresh session.

## Notes for implementation

- Tests run in Vitest with `fake-indexeddb`. The debounce tests use fake timers.
- The progress saver is a small object (`report(position)`, `flush()`) that takes the write function as a parameter, so it can be tested without IndexedDB.
- Hashing a large file reads it into memory once. That's acceptable for EPUBs, which are usually under 50 MB.

## Out of scope

- Removing books (M6 library page).
- Lookup history (M6).
- Sync across devices or tabs.
