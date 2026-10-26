// The reader: top bar, TOC and settings panels, book, page arrows and bottom bar.
// Spec: docs/features/epub-reader.md; the selection menu: docs/features/selection-menu.md.
import { displayTerm, normalise, type LookupKind } from '@litsnap/shared';
import type { BookMetadata, RelocateDetail, TocItem } from 'foliate-js/view.js';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { defaultLookupClient } from '../lookup/client';
import { LookupModal, type LookupRequest } from '../lookup/LookupModal';
import { kindForKey, SelectionMenu, type SelectionMenuHandle } from '../lookup/SelectionMenu';
import { sourceSentence } from '../lookup/sourceSentence';
import { appStore } from '../storage/appStore';
import type { Position, Settings, Theme } from '../storage/bookStore';
import { createProgressSaver } from '../storage/progressSaver';
import { ReaderView, type BookSelection, type OpenedBook, type ReaderControls } from './ReaderView';
import { SettingsPanel } from './SettingsPanel';
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
  settings: Settings;
  /** The theme in use: `settings.theme`, or the OS preference when that's unset. */
  theme: Theme;
  /** Messages to show above the book (e.g. storage full). */
  status: ReactNode;
  onChooseFile: () => void;
  onDropFile: (file: File) => void;
  onSettingsChange: (patch: Partial<Settings>) => void;
  onOpen: (file: File, metadata: BookMetadata | undefined) => void;
  onError: (error: unknown) => void;
}

type Panel = 'toc' | 'settings';

/** Whether a key press is ours to handle: not while typing, and not with Ctrl/Alt/Meta. */
function isReaderKey(event: KeyboardEvent) {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return false;
  const target = event.target as Partial<HTMLElement> | null;
  return !(
    target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')
  );
}

/** Keys for the selection menu while it's visible (MENU-7, MENU-8, MENU-11). */
function menuKeyAction(event: KeyboardEvent) {
  if (!isReaderKey(event)) return undefined;
  if (event.key === 'Escape') return 'dismiss';
  if (event.key === 'Tab' && !event.shiftKey) return 'focusMenu';
  return kindForKey(event.key);
}

/** Keys that turn pages (RD-12), or close a panel. Ignored while typing or with modifiers. */
function keyAction(event: KeyboardEvent) {
  if (!isReaderKey(event)) return undefined;
  const actions = {
    ArrowRight: 'goRight',
    ArrowLeft: 'goLeft',
    PageDown: 'next',
    PageUp: 'prev',
    Escape: 'closePanel',
  } as const;
  return event.key in actions ? actions[event.key as keyof typeof actions] : undefined;
}

export function ReaderScreen(props: ReaderScreenProps) {
  const { book, settings, theme, status, onDropFile } = props;
  const controls = useRef<ReaderControls>(null);
  const tocButton = useRef<HTMLButtonElement>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [fixedLayout, setFixedLayout] = useState(false);
  const [panel, setPanel] = useState<Panel>();
  const [location, setLocation] = useState<RelocateDetail>();
  // The selection the menu is shown for (selection-menu.md), and the open lookup (lookup-modal.md).
  const [selection, setSelection] = useState<BookSelection>();
  const [lookup, setLookup] = useState<LookupRequest>();
  const menu = useRef<SelectionMenuHandle>(null);

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

  const { onOpen } = props;
  const onBookOpen = useCallback(
    (file: File, opened: OpenedBook) => {
      setToc(opened.toc);
      setFixedLayout(opened.fixedLayout);
      onOpen(file, opened.metadata);
    },
    [onOpen],
  );

  const togglePanel = (which: Panel) => {
    setPanel((open) => (open === which ? undefined : which));
  };

  const menuOpen = selection !== undefined && lookup === undefined;

  /** Closes the menu, keeping the selection; the keyboard goes back to the book if it was in it. */
  const closeMenu = useCallback(() => {
    if (menu.current?.contains(document.activeElement)) controls.current?.focusBook();
    setSelection(undefined);
  }, []);

  /** MENU-7, MODAL-1: the menu closes and the modal opens; the selection stays underneath. */
  const choose = useCallback(
    (kind: LookupKind) => {
      if (!selection) return;
      setLookup({
        kind,
        term: normalise(selection.text),
        display: displayTerm(selection.text),
        sentence: sourceSentence(selection.range),
      });
      setSelection(undefined);
    },
    [selection],
  );

  /** MODAL-17: the selection is cleared and the keyboard goes back to the book. */
  const closeLookup = useCallback(() => {
    setLookup(undefined);
    controls.current?.clearSelection();
    controls.current?.focusBook();
  }, []);

  // MENU-9: clicking our own interface closes the menu. (Clicks in the book clear the selection,
  // and resizing re-lays out the book, which counts as it moving: ReaderView reports both.)
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) closeMenu();
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [menuOpen, closeMenu]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // MODAL-18: the modal's own keys (Esc, Tab) are the browser's; the reader's are off.
      if (lookup) return;
      const menuAction = menuOpen ? menuKeyAction(event) : undefined;
      const tabbingOutOfMenu =
        menuAction === 'focusMenu' && menu.current?.contains(document.activeElement);
      if (menuAction && !tabbingOutOfMenu) {
        event.preventDefault();
        if (menuAction === 'dismiss') closeMenu();
        else if (menuAction === 'focusMenu') menu.current?.focusFirst();
        else choose(menuAction);
        return;
      }

      const action = keyAction(event);
      if (!action || (action === 'closePanel' && !panel)) return;
      event.preventDefault();
      if (action === 'closePanel') {
        // Back to the button that opened the panel.
        (panel === 'toc' ? tocButton : settingsButton).current?.focus();
        setPanel(undefined);
      } else {
        controls.current?.[action]();
      }
    },
    [panel, menuOpen, closeMenu, choose, lookup],
  );

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onKeyDown]);

  const progress = location && `${String(Math.round(location.fraction * 100))}%`;

  return (
    <div
      className="reader"
      // RD-26: dropping a book anywhere on the reader opens it (the book's own iframe forwards its
      // drops via ReaderView).
      onDragOver={(event) => {
        event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
        const file = event.dataTransfer.files[0];
        if (file) onDropFile(file);
      }}
    >
      <header className="top-bar">
        <button
          ref={tocButton}
          type="button"
          aria-expanded={panel === 'toc'}
          onClick={() => {
            togglePanel('toc');
          }}
        >
          Contents
        </button>
        <h1 className="book-title">{book.title}</h1>
        <button
          ref={settingsButton}
          type="button"
          aria-expanded={panel === 'settings'}
          onClick={() => {
            togglePanel('settings');
          }}
        >
          Settings
        </button>
        <button type="button" onClick={props.onChooseFile}>
          Open another book
        </button>
      </header>
      {status && <div className="reader-notice">{status}</div>}
      <div className="reader-body">
        {panel === 'toc' && (
          <TocPanel
            items={toc}
            currentHref={location?.tocItem?.href}
            onSelect={(href) => {
              controls.current?.goTo(href);
              setPanel(undefined);
            }}
          />
        )}
        {panel === 'settings' && (
          <SettingsPanel
            settings={settings}
            theme={theme}
            fixedLayout={fixedLayout}
            onChange={props.onSettingsChange}
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
          appearance={{ fontSize: settings.fontSize, theme, layout: settings.layout }}
          onOpen={onBookOpen}
          onRelocate={onRelocate}
          onKeyDown={onKeyDown}
          onDropFile={onDropFile}
          onSelection={setSelection}
          onError={props.onError}
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
      {menuOpen && <SelectionMenu ref={menu} anchor={selection.anchor} onChoose={choose} />}
      {lookup && (
        <LookupModal
          request={lookup}
          client={defaultLookupClient}
          size={settings.lookupSize}
          onSizeChange={(lookupSize) => {
            props.onSettingsChange({ lookupSize });
          }}
          onClose={closeLookup}
        />
      )}
    </div>
  );
}
