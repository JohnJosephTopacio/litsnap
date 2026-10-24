import type { BookMetadata } from 'foliate-js/view.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { checkFile } from './reader/checkFile';
import { bookAuthor, bookTitle } from './reader/bookMetadata';
import { Notice, type NoticeKind } from './reader/Notice';
import { effectiveTheme } from './reader/appearance';
import { ReaderScreen, type OpenBook } from './reader/ReaderScreen';
import { usePrefersDark, useSettings } from './reader/useSettings';
import { appStore } from './storage/appStore';
import { bookId, StorageFullError } from './storage/bookStore';

interface AppBook extends OpenBook {
  /** Reopened from storage at startup, rather than chosen just now. */
  reopened: boolean;
}

/** Saves the book and makes it current. Throws StorageFullError if the browser is out of space. */
async function saveBook(file: File, metadata: BookMetadata | undefined) {
  const store = await appStore();
  const saved = await store.saveBook({
    blob: file,
    fileName: file.name,
    title: bookTitle(metadata),
    author: bookAuthor(metadata),
  });
  await store.setCurrentBook(saved.id);
}

/** RD-8, RD-10: the book that was open last time, at its saved position. */
async function currentBook(): Promise<AppBook | undefined> {
  const store = await appStore();
  const stored = await store.getCurrentBook();
  if (!stored) return undefined;
  const progress = await store.getProgress(stored.id);
  return {
    id: stored.id,
    file: new File([stored.blob], stored.fileName, { type: stored.blob.type }),
    title: stored.title,
    initialPosition: progress && { cfi: progress.cfi, fraction: progress.fraction },
    reopened: true,
  };
}

export function App() {
  const [book, setBook] = useState<AppBook>();
  const [starting, setStarting] = useState(true);
  const [notice, setNotice] = useState<NoticeKind>();
  const [checking, setChecking] = useState(false);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const reopened = book?.reopened ?? false;
  const { settings, update: updateSettings } = useSettings();
  const theme = effectiveTheme(settings?.theme, usePrefersDark());

  // The app's own colours follow the reader theme too (RD-16), via `color-scheme` in styles.css.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // On start, go straight back into the last book without showing the open screen (RD-8).
  useEffect(() => {
    let cancelled = false;
    currentBook()
      .then((found) => {
        if (!cancelled && found) setBook(found);
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setStarting(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Checks the file before foliate sees it. A rejected file is never stored (RD-3…5). */
  async function openFile(file: File) {
    setNotice(undefined);
    setChecking(true);
    try {
      const problem = await checkFile(file);
      // If a book is already open, it stays open and the message shows above it.
      if (problem) {
        setNotice(problem);
        return;
      }
      // Re-opening a file LitSnap has seen before resumes where the reader left off (STO-3).
      const id = await bookId(file);
      const progress = await (await appStore()).getProgress(id);
      setBook({
        id,
        file,
        title: file.name,
        initialPosition: progress && { cfi: progress.cfi, fraction: progress.fraction },
        reopened: false,
      });
    } finally {
      setChecking(false);
    }
  }

  function onFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // so choosing the same file again still fires `change`
    if (file) void openFile(file);
  }

  function onDrop(event: React.DragEvent) {
    event.preventDefault(); // otherwise the browser navigates to the dropped file
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void openFile(file);
  }

  const onOpen = useCallback(
    (file: File, metadata: BookMetadata | undefined) => {
      setBook((current) =>
        current?.file === file
          ? { ...current, title: bookTitle(metadata) || current.title }
          : current,
      );
      if (reopened) return; // already stored
      saveBook(file, metadata).catch((error: unknown) => {
        // The book is open either way; it just won't be remembered (RD-6).
        if (error instanceof StorageFullError) setNotice('storage-full');
        else console.error('Saving the book failed', error);
      });
    },
    [reopened],
  );

  const onError = useCallback(() => {
    // A stored book that no longer opens gets its own message (RD-11).
    setNotice(reopened ? 'reopen-failed' : 'invalid');
    setBook(undefined);
  }, [reopened]);

  const fileInput = (
    <input
      ref={input}
      type="file"
      accept=".epub,application/epub+zip"
      hidden
      onChange={onFileChosen}
    />
  );
  const chooseFile = () => input.current?.click();
  const status = checking ? <p role="status">Opening…</p> : notice && <Notice kind={notice} />;

  // Settings are needed before the first page, so the book doesn't render and then jump.
  if (starting || (book && !settings)) return <p role="status">Opening…</p>;

  if (book && settings) {
    return (
      <>
        <ReaderScreen
          book={book}
          settings={settings}
          theme={theme}
          status={status}
          onChooseFile={chooseFile}
          onDropFile={(file) => void openFile(file)}
          onSettingsChange={updateSettings}
          onOpen={onOpen}
          onError={onError}
        />
        {fileInput}
      </>
    );
  }

  return (
    <div
      className={dragging ? 'drop-zone dragging' : 'drop-zone'}
      onDragOver={(event) => {
        event.preventDefault(); // required for the element to accept a drop
        setDragging(true);
      }}
      onDragLeave={() => {
        setDragging(false);
      }}
      onDrop={onDrop}
    >
      <main className="open-screen">
        <h1>LitSnap</h1>
        <p>Highlight a word in your book to see its meaning — without leaving the page.</p>
        <button type="button" onClick={chooseFile}>
          Open a book
        </button>
        {fileInput}
        <p className="hint">…or drop an EPUB anywhere on this page.</p>
        {status}
      </main>
      <footer>
        {/* New tab, so the reader is never interrupted (TERMS-4). */}
        <a href="/terms" target="_blank" rel="noopener noreferrer">
          Terms
        </a>
      </footer>
    </div>
  );
}
