// Types for the parts of vendored foliate-js (apps/web/vendor/foliate-js) that LitSnap uses.
// foliate-js is plain JavaScript; these describe its behaviour at the pinned commit (VENDORED.md).

declare module 'foliate-js/view.js' {
  /** A plain string, or a map of language code → string (EPUB 3 alternate scripts). */
  export type LanguageMap = string | Record<string, string>;
  export type Contributor = string | { name?: LanguageMap };

  export interface BookMetadata {
    title?: LanguageMap;
    author?: Contributor | Contributor[];
  }

  /** A table-of-contents entry. `label` is untrusted book text. */
  export interface TocItem {
    label: string;
    href: string;
    subitems?: TocItem[];
  }

  export interface Book {
    metadata?: BookMetadata;
    toc?: TocItem[];
    /** The spine, in reading order. */
    sections: unknown[];
  }

  export interface ExternalLinkDetail {
    a: HTMLAnchorElement;
    /** The link's raw `href` attribute, from book content: untrusted. */
    href_: string;
  }

  export interface RelocateDetail {
    /** 0–1 through the whole book. */
    fraction: number;
    cfi: string;
    /** The chapter this location is in, if the book's TOC covers it. */
    tocItem?: { label: string; href: string };
  }

  export interface LoadDetail {
    /** The section's document, inside the book's iframe. */
    doc: Document;
    index: number;
  }

  export interface ViewEventMap extends HTMLElementEventMap {
    /** Cancelable. If not cancelled, foliate calls `window.open(href_, '_blank')`. */
    'external-link': CustomEvent<ExternalLinkDetail>;
    /** After every navigation, page turn or scroll. */
    relocate: CustomEvent<RelocateDetail>;
    /** Each time a section's document is loaded into the iframe. */
    load: CustomEvent<LoadDetail>;
  }

  /** The `<foliate-view>` custom element, registered when view.js is imported. */
  export interface View extends HTMLElement {
    book: Book;
    /** Parses and renders the file. foliate picks the format from its bytes and name. */
    open(file: File): Promise<void>;
    /** Goes to `lastLocation`, the start of the text, or the first page. */
    init(options: { lastLocation?: string; showTextStart?: boolean }): Promise<void>;
    /**
     * A CFI, href or section index → section index and anchor. Doesn't check that the section
     * exists: a stale CFI can "resolve" to -1 (EPUB: spine item not found) or past the end.
     */
    resolveNavigation(target: string | number): { index: number } | undefined;
    goTo(target: string | number): Promise<unknown>;
    goToFraction(fraction: number): Promise<void>;
    next(): Promise<void>;
    prev(): Promise<void>;
    /** Spatial: left/right, which flips next/prev for right-to-left books. */
    goLeft(): Promise<void>;
    goRight(): Promise<void>;
    close(): void;
    addEventListener<K extends keyof ViewEventMap>(
      type: K,
      listener: (this: View, event: ViewEventMap[K]) => unknown,
      options?: boolean | AddEventListenerOptions,
    ): void;
    addEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ): void;
  }
}

interface HTMLElementTagNameMap {
  'foliate-view': import('foliate-js/view.js').View;
}
