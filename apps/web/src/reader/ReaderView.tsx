// Hosts foliate-js's <foliate-view> for one book. Spec: docs/features/epub-reader.md.
import { countWords, MAX_LOOKUP_WORDS, normalise } from '@litsnap/shared';
import type { BookMetadata, RelocateDetail, TocItem, View } from 'foliate-js/view.js';
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useRef,
  type Ref,
} from 'react';
import type { Box, MenuAnchor } from '../lookup/placeMenu';
import { createSelectionWatcher } from '../lookup/selectionWatcher';
import type { Layout, Position, Theme } from '../storage/bookStore';
import { bookCss } from './appearance';
import { openExternalLink } from './externalLinks';

/** A selection the lookup menu can be offered for (selection-menu MENU-1…3). */
export interface BookSelection {
  text: string;
  range: Range;
  /** Where it is on our page (not the book's iframe), for placing the menu. */
  anchor: MenuAnchor;
}

/** Identifies a selection, so a repeated `selectionchange` for it can be ignored. */
function selectionKey(doc: Document | undefined): string {
  const selection = doc?.getSelection();
  if (!selection?.rangeCount || selection.isCollapsed) return '';
  const range = selection.getRangeAt(0);
  return `${String(range.startOffset)}:${String(range.endOffset)}:${selection.toString()}`;
}

/** Rounding and borders can put a line a pixel outside the reader area. */
const EDGE_TOLERANCE = 1;

/**
 * The selection in `doc` if it has 1–6 words (MENU-2) and is fully on screen (MENU-10), with its
 * first and last line moved from the iframe's coordinates into ours.
 */
function describeSelection(doc: Document, readerArea: Element): BookSelection | undefined {
  const selection = doc.getSelection();
  if (!selection?.rangeCount || selection.isCollapsed) return undefined;
  const text = selection.toString();
  const words = countWords(normalise(text));
  if (words < 1 || words > MAX_LOOKUP_WORDS) return undefined;

  const range = selection.getRangeAt(0);
  const lines = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
  const frame = doc.defaultView?.frameElement?.getBoundingClientRect();
  const firstLine = lines[0];
  const lastLine = lines.at(-1);
  if (!frame || !firstLine || !lastLine) return undefined;
  const toPage = (rect: DOMRect): Box => ({
    left: rect.left + frame.left,
    top: rect.top + frame.top,
    right: rect.right + frame.left,
    bottom: rect.bottom + frame.top,
  });
  const first = toPage(firstLine);
  const last = toPage(lastLine);
  const bounds = readerArea.getBoundingClientRect();
  const inside = (box: Box) =>
    box.left >= bounds.left - EDGE_TOLERANCE &&
    box.right <= bounds.right + EDGE_TOLERANCE &&
    box.top >= bounds.top - EDGE_TOLERANCE &&
    box.bottom <= bounds.bottom + EDGE_TOLERANCE;
  if (!inside(first) || !inside(last)) return undefined;

  return { text, range, anchor: { first, last, bounds } };
}

export interface Appearance {
  fontSize: number;
  theme: Theme;
  layout: Layout;
}

/** What the reader chrome needs once a book is parsed. */
export interface OpenedBook {
  metadata: BookMetadata | undefined;
  toc: TocItem[];
  /** Whole pages at a fixed size (RD-27/28): text size, layout and page theming don't apply. */
  fixedLayout: boolean;
}

function applyAppearance(view: View, { fontSize, theme, layout }: Appearance) {
  // Fixed-layout books use foliate's other renderer, which has neither setStyles() nor `flow`.
  // Their pages are designed artwork, so we don't restyle them either (RD-28, #17).
  if (view.isFixedLayout) return;
  view.renderer.setStyles(bookCss({ fontSize, theme }));
  if (view.renderer.getAttribute('flow') !== layout) view.renderer.setAttribute('flow', layout);
}

/** What the reader chrome can ask the book to do. */
export interface ReaderControls {
  goTo(href: string): void;
  next(): void;
  prev(): void;
  goLeft(): void;
  goRight(): void;
  /** Gives the keyboard back to the book (e.g. after the selection menu had focus). */
  focusBook(): void;
  /** Clears the selection in the book (after a lookup, lookup-modal MODAL-17). */
  clearSelection(): void;
}

interface ReaderViewProps {
  file: File;
  /** Where to start: a saved position, or the first page if absent. Read once per file. */
  initialPosition?: Position | undefined;
  /** Font size, theme and layout (RD-15…18); applied before the first page and on every change. */
  appearance: Appearance;
  ref?: Ref<ReaderControls>;
  /** Called once the book is parsed, before the first page renders. */
  onOpen: (file: File, opened: OpenedBook) => void;
  /** After every page turn or jump. */
  onRelocate: (detail: RelocateDetail) => void;
  /** Key presses inside the book's iframe, which don't reach our window. */
  onKeyDown: (event: KeyboardEvent) => void;
  /** A file dropped onto the book's iframe, which our page never sees otherwise (RD-26). */
  onDropFile: (file: File) => void;
  /** A selection to offer lookups for, or `undefined` when the menu should go (MENU-1…3, 10). */
  onSelection: (selection: BookSelection | undefined) => void;
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

export function ReaderView({
  file,
  initialPosition,
  appearance,
  ref,
  ...handlers
}: ReaderViewProps) {
  const container = useRef<HTMLDivElement>(null);
  const view = useRef<View>(undefined);
  // foliate silently ignores navigation while a page turn (or the initial positioning) is still
  // running. So calls go through a queue, each waiting for the previous one, and the queue only
  // starts once the book is open and positioned.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const queued = useRef(0);
  /** The book document the reader last selected in or clicked. */
  const activeDoc = useRef<Document>(undefined);

  // Only touches refs, so it's the same function on every render.
  const call = useCallback((action: (v: View) => Promise<unknown>) => {
    if (queued.current >= MAX_QUEUED) return;
    queued.current++;
    queue.current = queue.current
      .then(() => view.current && action(view.current))
      .catch(console.error)
      .finally(() => {
        queued.current--;
      });
  }, []);

  useImperativeHandle(ref, () => {
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
      focusBook: () => {
        activeDoc.current?.defaultView?.focus();
      },
      clearSelection: () => {
        activeDoc.current?.getSelection()?.removeAllRanges();
      },
    };
  }, [call]);

  // Effect events: always the latest props, without re-running the effect (and reopening the
  // book) when a parent re-renders with new callbacks.
  const onOpen = useEffectEvent(handlers.onOpen);
  const onRelocate = useEffectEvent(handlers.onRelocate);
  const onKeyDown = useEffectEvent(handlers.onKeyDown);
  const onError = useEffectEvent(handlers.onError);
  const onDropFile = useEffectEvent(handlers.onDropFile);
  const onSelection = useEffectEvent(handlers.onSelection);
  const startAt = useEffectEvent(() => initialPosition);
  const latestAppearance = useEffectEvent(() => appearance);

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

    // When to offer the lookup menu (selection-menu.md). Fixed-layout books get lookups with #19.
    const watcher = createSelectionWatcher({
      key: () => selectionKey(activeDoc.current),
      show: () => {
        const doc = activeDoc.current;
        const area = container.current;
        const usable = doc && area && current && !current.isFixedLayout;
        onSelection(usable ? describeSelection(doc, area) : undefined);
      },
      hide: () => {
        onSelection(undefined);
      },
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
      // Links inside the book (footnotes, cross-references, RD-19): foliate would navigate
      // straight away, and drop the jump if a page turn is still settling. Queue it instead.
      current.addEventListener('link', (event) => {
        event.preventDefault();
        const { href } = event.detail;
        call((v) => v.goTo(href));
      });
      current.addEventListener('relocate', (event) => {
        onRelocate(event.detail);
        watcher.relocated();
      });
      current.addEventListener('load', (event) => {
        const { doc } = event.detail;
        doc.addEventListener('keydown', (keyEvent) => {
          onKeyDown(keyEvent);
        });
        doc.addEventListener('pointerdown', () => {
          activeDoc.current = doc;
          watcher.pointerDown();
        });
        const released = () => {
          activeDoc.current = doc;
          watcher.pointerUp();
        };
        doc.addEventListener('pointerup', released);
        // Pressing on selected text drags it instead of selecting, and cancels the pointer: without
        // this the watcher would think the button is still down.
        doc.addEventListener('pointercancel', released);
        doc.addEventListener('selectionchange', () => {
          activeDoc.current = doc;
          watcher.selectionChange();
        });
        // Without these, a file dropped on the page would be opened *inside* the book's iframe.
        doc.addEventListener('dragover', (dragEvent) => {
          dragEvent.preventDefault();
        });
        doc.addEventListener('drop', (dropEvent) => {
          dropEvent.preventDefault();
          const dropped = dropEvent.dataTransfer?.files[0];
          // The File belongs to the iframe's JavaScript realm, so `instanceof Blob` checks in our
          // realm (zip.js has them) fail. Re-wrap it as one of ours; the bytes aren't copied.
          if (dropped) onDropFile(new File([dropped], dropped.name, { type: dropped.type }));
        });
      });
      container.current.append(current);

      await current.open(file);
      if (isCancelled()) return;
      onOpen(file, {
        metadata: current.book.metadata,
        toc: current.book.toc ?? [],
        fixedLayout: current.isFixedLayout,
      });
      applyAppearance(current, latestAppearance()); // before the first page, so it doesn't jump

      const position = startAt();
      if (position) await restore(current, position);
      else await current.init({});
      if (isCancelled()) return;
      view.current = current;
      // Settings changed while the book was opening were skipped by the effect below (no view
      // yet), so apply the latest ones now.
      applyAppearance(current, latestAppearance());
    }

    open()
      .catch((error: unknown) => {
        if (!isCancelled()) onError(error);
      })
      .finally(markReady);

    return () => {
      cancelled = true;
      watcher.dispose();
      activeDoc.current = undefined;
      markReady(); // let anything queued run (and find no view), rather than wait forever
      view.current = undefined;
      try {
        current?.close();
      } catch (error) {
        // foliate's paginator throws when it's closed before its first section has loaded (its
        // view doesn't exist yet). Leaving that early is normal (Home, RD-30); a throw here would
        // unmount the whole app. The element is removed below either way.
        console.warn('Closed the book before it finished opening', error);
      }
      current?.remove();
    };
  }, [file, call]);

  // Settings changed while reading (RD-15…18). The first application happens in open() above.
  const { fontSize, theme, layout } = appearance;
  useEffect(() => {
    if (view.current) applyAppearance(view.current, { fontSize, theme, layout });
  }, [fontSize, theme, layout]);

  return <div ref={container} className="reader-view" />;
}
