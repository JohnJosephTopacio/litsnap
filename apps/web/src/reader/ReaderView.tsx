// Hosts foliate-js's <foliate-view> for one book. Spec: docs/features/epub-reader.md.
import type { BookMetadata, RelocateDetail, TocItem, View } from 'foliate-js/view.js';
import { useEffect, useEffectEvent, useImperativeHandle, useRef, type Ref } from 'react';
import type { Position } from '../storage/bookStore';
import { openExternalLink } from './externalLinks';

/** What the reader chrome can ask the book to do. */
export interface ReaderControls {
  goTo(href: string): void;
  next(): void;
  prev(): void;
  goLeft(): void;
  goRight(): void;
}

interface ReaderViewProps {
  file: File;
  /** Where to start: a saved position, or the first page if absent. Read once per file. */
  initialPosition?: Position | undefined;
  ref?: Ref<ReaderControls>;
  /** Called once the book is parsed, before the first page renders. */
  onOpen: (file: File, metadata: BookMetadata | undefined, toc: TocItem[]) => void;
  /** After every page turn or jump. */
  onRelocate: (detail: RelocateDetail) => void;
  /** Key presses inside the book's iframe, which don't reach our window. */
  onKeyDown: (event: KeyboardEvent) => void;
  onError: (error: unknown) => void;
}

/** RD-8/RD-9: the saved CFI if it still points into this book, otherwise the saved fraction. */
async function restore(view: View, position: Position) {
  const index = view.resolveNavigation(position.cfi)?.index ?? -1;
  // A CFI for a spine item that no longer exists resolves to -1 (EPUB) or past the end.
  if (index >= 0 && index < view.book.sections.length) {
    try {
      await view.init({ lastLocation: position.cfi });
      return;
    } catch {
      // The section exists but the path inside it doesn't: fall through to the fraction.
    }
  }
  await view.goToFraction(position.fraction);
}

/** At most this many navigation calls wait their turn; more (a held-down arrow key) are dropped. */
const MAX_QUEUED = 2;

export function ReaderView({ file, initialPosition, ref, ...handlers }: ReaderViewProps) {
  const container = useRef<HTMLDivElement>(null);
  const view = useRef<View>(undefined);
  // foliate silently ignores navigation while a page turn (or the initial positioning) is still
  // running. So calls go through a queue, each waiting for the previous one, and the queue only
  // starts once the book is open and positioned.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const queued = useRef(0);

  useImperativeHandle(ref, () => {
    const call = (action: (v: View) => Promise<unknown>) => {
      if (queued.current >= MAX_QUEUED) return;
      queued.current++;
      queue.current = queue.current
        .then(() => view.current && action(view.current))
        .catch(console.error)
        .finally(() => {
          queued.current--;
        });
    };
    return {
      goTo: (href) => {
        call((v) => v.goTo(href));
      },
      next: () => {
        call((v) => v.next());
      },
      prev: () => {
        call((v) => v.prev());
      },
      goLeft: () => {
        call((v) => v.goLeft());
      },
      goRight: () => {
        call((v) => v.goRight());
      },
    };
  }, []);

  // Effect events: always the latest props, without re-running the effect (and reopening the
  // book) when a parent re-renders with new callbacks.
  const onOpen = useEffectEvent(handlers.onOpen);
  const onRelocate = useEffectEvent(handlers.onRelocate);
  const onKeyDown = useEffectEvent(handlers.onKeyDown);
  const onError = useEffectEvent(handlers.onError);
  const startAt = useEffectEvent(() => initialPosition);

  useEffect(() => {
    let cancelled = false;
    // Read through a function: TypeScript would otherwise assume `cancelled` can't change across
    // an `await`, but the cleanup below sets it while we're waiting.
    const isCancelled = () => cancelled;
    let current: View | undefined;
    let markReady: () => void = () => undefined;
    queue.current = new Promise<void>((resolve) => {
      markReady = resolve;
    });

    async function open() {
      // Loaded on demand, so the open screen doesn't download the reader.
      await import('foliate-js/view.js');
      if (isCancelled() || !container.current) return;

      current = document.createElement('foliate-view');
      // foliate's default would call window.open(href) for *any* scheme, javascript: included, and
      // without noopener. Always cancel it; open only http(s) ourselves (RD-20).
      current.addEventListener('external-link', (event) => {
        event.preventDefault();
        openExternalLink(event.detail.href_);
      });
      current.addEventListener('relocate', (event) => {
        onRelocate(event.detail);
      });
      current.addEventListener('load', (event) => {
        event.detail.doc.addEventListener('keydown', (keyEvent) => {
          onKeyDown(keyEvent);
        });
      });
      container.current.append(current);

      await current.open(file);
      if (isCancelled()) return;
      onOpen(file, current.book.metadata, current.book.toc ?? []);

      const position = startAt();
      if (position) await restore(current, position);
      else await current.init({});
      if (isCancelled()) return;
      view.current = current;
    }

    open()
      .catch((error: unknown) => {
        if (!isCancelled()) onError(error);
      })
      .finally(markReady);

    return () => {
      cancelled = true;
      markReady(); // let anything queued run (and find no view), rather than wait forever
      view.current = undefined;
      current?.close();
      current?.remove();
    };
  }, [file]);

  return <div ref={container} className="reader-view" />;
}
