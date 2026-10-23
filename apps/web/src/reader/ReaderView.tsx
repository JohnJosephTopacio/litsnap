// Hosts foliate-js's <foliate-view> for one book. Spec: docs/features/epub-reader.md.
import type { BookMetadata, View } from 'foliate-js/view.js';
import { useEffect, useRef } from 'react';
import { openExternalLink } from './externalLinks';

interface ReaderViewProps {
  file: File;
  /** Called once the book is parsed, before the first page renders. */
  onOpen: (file: File, metadata: BookMetadata | undefined) => void;
  onError: (error: unknown) => void;
}

export function ReaderView({ file, onOpen, onError }: ReaderViewProps) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    // Read through a function: TypeScript would otherwise assume `cancelled` can't change across
    // an `await`, but the cleanup below sets it while we're waiting.
    const isCancelled = () => cancelled;
    let view: View | undefined;

    async function open() {
      // Loaded on demand, so the open screen doesn't download the reader.
      await import('foliate-js/view.js');
      if (isCancelled() || !container.current) return;

      view = document.createElement('foliate-view');
      // foliate's default would call window.open(href) for *any* scheme, javascript: included, and
      // without noopener. Always cancel it; open only http(s) ourselves (RD-20).
      view.addEventListener('external-link', (event) => {
        event.preventDefault();
        openExternalLink(event.detail.href_);
      });
      container.current.append(view);

      await view.open(file);
      if (isCancelled()) return;
      onOpen(file, view.book.metadata);
      await view.init({});
    }

    open().catch((error: unknown) => {
      if (!isCancelled()) onError(error);
    });

    return () => {
      cancelled = true;
      view?.close();
      view?.remove();
    };
  }, [file, onOpen, onError]);

  return <div ref={container} className="reader-view" />;
}
