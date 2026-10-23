import type { BookMetadata } from 'foliate-js/view.js';
import { useCallback, useRef, useState } from 'react';
import { bookTitle } from './reader/bookMetadata';
import { ReaderView } from './reader/ReaderView';

interface OpenBook {
  file: File;
  /** From the book's metadata once parsed; untrusted text, rendered as text only (RD-24). */
  title: string;
}

export function App() {
  const [book, setBook] = useState<OpenBook>();
  const [error, setError] = useState<string>();
  const input = useRef<HTMLInputElement>(null);

  function chooseFile() {
    input.current?.click();
  }

  function onFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // so choosing the same file again still fires `change`
    if (!file) return;
    setError(undefined);
    setBook({ file, title: file.name });
  }

  const onOpen = useCallback((metadata: BookMetadata | undefined) => {
    setBook((current) => current && { ...current, title: bookTitle(metadata) || current.title });
  }, []);

  const onError = useCallback(() => {
    setBook(undefined);
    setError("This file couldn't be opened as an EPUB.");
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

  if (book) {
    return (
      <div className="reader">
        <header className="top-bar">
          <h1 className="book-title">{book.title}</h1>
          <button type="button" onClick={chooseFile}>
            Open another book
          </button>
          {fileInput}
        </header>
        <ReaderView file={book.file} onOpen={onOpen} onError={onError} />
      </div>
    );
  }

  return (
    <>
      <main className="open-screen">
        <h1>LitSnap</h1>
        <p>Highlight a word in your book to see its meaning — without leaving the page.</p>
        <button type="button" onClick={chooseFile}>
          Open a book
        </button>
        {fileInput}
        {error && <p role="alert">{error}</p>}
      </main>
      <footer>
        {/* New tab, so the reader is never interrupted (TERMS-4). */}
        <a href="/terms" target="_blank" rel="noopener noreferrer">
          Terms
        </a>
      </footer>
    </>
  );
}
