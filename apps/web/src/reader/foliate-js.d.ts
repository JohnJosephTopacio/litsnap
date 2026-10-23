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

  export interface Book {
    metadata?: BookMetadata;
  }

  export interface ExternalLinkDetail {
    a: HTMLAnchorElement;
    /** The link's raw `href` attribute, from book content: untrusted. */
    href_: string;
  }

  export interface ViewEventMap extends HTMLElementEventMap {
    /** Cancelable. If not cancelled, foliate calls `window.open(href_, '_blank')`. */
    'external-link': CustomEvent<ExternalLinkDetail>;
  }

  /** The `<foliate-view>` custom element, registered when view.js is imported. */
  export interface View extends HTMLElement {
    book: Book;
    /** Parses and renders the file. foliate picks the format from its bytes and name. */
    open(file: File): Promise<void>;
    /** Goes to `lastLocation`, the start of the text, or the first page. */
    init(options: { lastLocation?: string; showTextStart?: boolean }): Promise<void>;
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
