import type { BookMetadata } from 'foliate-js/view.js';
import { useCallback, useRef, useState } from 'react';
import { checkFile } from './reader/checkFile';
import { bookAuthor, bookTitle } from './reader/bookMetadata';
import { Notice, type NoticeKind } from './reader/Notice';
import { ReaderView } from './reader/ReaderView';
import { appStore } from './storage/appStore';
import { StorageFullError } from './storage/bookStore';

interface OpenBook {
  file: File;
  /** From the book's metadata once parsed; untrusted text, rendered as text only (RD-24). */
  title: string;
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

export function App() {
  const [book, setBook] = useState<OpenBook>();
  const [notice, setNotice] = useState<NoticeKind>();
  const [checking, setChecking] = useState(false);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  /** Checks the file before foliate sees it. A rejected file is never stored (RD-3…5). */
  async function openFile(file: File) {
    setNotice(undefined);
    setChecking(true);
    try {
      const problem = await checkFile(file);
      // If a book is already open, it stays open and the message shows above it.
      if (problem) setNotice(problem);
      else setBook({ file, title: file.name });
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

  const onOpen = useCallback((file: File, metadata: BookMetadata | undefined) => {
    setBook((current) =>
      current?.file === file
        ? { ...current, title: bookTitle(metadata) || current.title }
        : current,
    );
    saveBook(file, metadata).catch((error: unknown) => {
      // The book is open either way; it just won't be remembered (RD-6).
      if (error instanceof StorageFullError) setNotice('storage-full');
      else console.error('Saving the book failed', error);
    });
  }, []);

  const onError = useCallback(() => {
    setBook(undefined);
    setNotice('invalid');
  }, []);

  const fileInput = (
    <input
      ref={input}
      type="file"
      accept=".epub,application/epub+zip"
      hidden
      onChange={onFileChosen}
    />
  );
  const status = checking ? <p role="status">Opening…</p> : notice && <Notice kind={notice} />;

  if (book) {
    return (
      <div className="reader">
        <header className="top-bar">
          <h1 className="book-title">{book.title}</h1>
          <button type="button" onClick={() => input.current?.click()}>
            Open another book
          </button>
          {fileInput}
        </header>
        {status && <div className="reader-notice">{status}</div>}
        <ReaderView file={book.file} onOpen={onOpen} onError={onError} />
      </div>
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
        <button type="button" onClick={() => input.current?.click()}>
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
