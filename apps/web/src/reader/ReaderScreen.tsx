// The reader: top bar, TOC panel, book, page arrows and bottom bar. Spec: docs/features/epub-reader.md.
import type { BookMetadata, RelocateDetail, TocItem } from 'foliate-js/view.js';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { appStore } from '../storage/appStore';
import type { Position } from '../storage/bookStore';
import { createProgressSaver } from '../storage/progressSaver';
import { ReaderView, type ReaderControls } from './ReaderView';
import { TocPanel } from './TocPanel';

export interface OpenBook {
  /** SHA-256 of the file (book-storage STO-1); progress is saved under it. */
  id: string;
  file: File;
  /** From the book's metadata once parsed; untrusted text, rendered as text only (RD-24). */
  title: string;
  initialPosition: Position | undefined;
}

interface ReaderScreenProps {
  book: OpenBook;
  /** Messages to show above the book (e.g. storage full). */
  status: ReactNode;
  onChooseFile: () => void;
  onOpen: (file: File, metadata: BookMetadata | undefined) => void;
  onError: (error: unknown) => void;
}

/** Keys that turn pages (RD-12), or close the TOC. Ignored while typing or with modifiers. */
function keyAction(event: KeyboardEvent) {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return undefined;
  const target = event.target as Partial<HTMLElement> | null;
  if (
    target?.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')
  ) {
    return undefined;
  }
  const actions = {
    ArrowRight: 'goRight',
    ArrowLeft: 'goLeft',
    PageDown: 'next',
    PageUp: 'prev',
    Escape: 'closeToc',
  } as const;
  return event.key in actions ? actions[event.key as keyof typeof actions] : undefined;
}

export function ReaderScreen({ book, status, onChooseFile, onOpen, onError }: ReaderScreenProps) {
  const controls = useRef<ReaderControls>(null);
  const tocButton = useRef<HTMLButtonElement>(null);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [tocOpen, setTocOpen] = useState(false);
  const [location, setLocation] = useState<RelocateDetail>();

  // Debounced progress writes (STO-9), flushed when the page is hidden or the book changes (STO-10).
  const saver = useMemo(
    () =>
      createProgressSaver(async (position) => {
        await (await appStore()).saveProgress(book.id, position);
      }),
    [book.id],
  );
  useEffect(() => {
    const flushIfHidden = () => {
      if (document.visibilityState === 'hidden') saver.flush().catch(console.error);
    };
    document.addEventListener('visibilitychange', flushIfHidden);
    return () => {
      document.removeEventListener('visibilitychange', flushIfHidden);
      saver.flush().catch(console.error);
    };
  }, [saver]);

  const onRelocate = useCallback(
    (detail: RelocateDetail) => {
      setLocation(detail);
      saver.report({ cfi: detail.cfi, fraction: detail.fraction });
    },
    [saver],
  );

  const onBookOpen = useCallback(
    (file: File, metadata: BookMetadata | undefined, items: TocItem[]) => {
      setToc(items);
      onOpen(file, metadata);
    },
    [onOpen],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const action = keyAction(event);
      if (!action || (action === 'closeToc' && !tocOpen)) return;
      event.preventDefault();
      if (action === 'closeToc') {
        setTocOpen(false);
        tocButton.current?.focus(); // back to where the user opened it
      } else {
        controls.current?.[action]();
      }
    },
    [tocOpen],
  );

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onKeyDown]);

  const progress = location && `${String(Math.round(location.fraction * 100))}%`;

  return (
    <div className="reader">
      <header className="top-bar">
        <button
          ref={tocButton}
          type="button"
          aria-expanded={tocOpen}
          onClick={() => {
            setTocOpen((open) => !open);
          }}
        >
          Contents
        </button>
        <h1 className="book-title">{book.title}</h1>
        <button type="button" onClick={onChooseFile}>
          Open another book
        </button>
      </header>
      {status && <div className="reader-notice">{status}</div>}
      <div className="reader-body">
        {tocOpen && (
          <TocPanel
            items={toc}
            currentHref={location?.tocItem?.href}
            onSelect={(href) => {
              controls.current?.goTo(href);
              setTocOpen(false);
            }}
          />
        )}
        <button
          type="button"
          className="page-arrow"
          aria-label="Previous page"
          onClick={() => controls.current?.goLeft()}
        >
          ‹
        </button>
        <ReaderView
          ref={controls}
          file={book.file}
          initialPosition={book.initialPosition}
          onOpen={onBookOpen}
          onRelocate={onRelocate}
          onKeyDown={onKeyDown}
          onError={onError}
        />
        <button
          type="button"
          className="page-arrow"
          aria-label="Next page"
          onClick={() => controls.current?.goRight()}
        >
          ›
        </button>
      </div>
      <footer className="bottom-bar" aria-label="Reading progress">
        <span className="chapter">{location?.tocItem?.label}</span>
        <span>{progress}</span>
      </footer>
    </div>
  );
}
