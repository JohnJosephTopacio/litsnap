// User-facing messages for opening and saving books. Wording: docs/features/epub-reader.md.
import type { FileProblem } from './checkFile';

export type NoticeKind = FileProblem | 'storage-full';

const external = { target: '_blank', rel: 'noopener noreferrer' } as const;

export function Notice({ kind }: { kind: NoticeKind }) {
  switch (kind) {
    case 'unsupported':
      return <p role="alert">Only EPUB files are supported for now.</p>;
    case 'invalid':
      return <p role="alert">This file couldn&apos;t be opened as an EPUB.</p>;
    case 'drm':
      return (
        <p role="alert">
          This book is DRM-protected and can&apos;t be opened. You can find DRM-free books at{' '}
          <a href="https://www.gutenberg.org/" {...external}>
            Project Gutenberg
          </a>{' '}
          and{' '}
          <a href="https://standardebooks.org/" {...external}>
            Standard Ebooks
          </a>
          .
        </p>
      );
    case 'storage-full':
      // Not an error the user caused: the book is open, it just won't be remembered.
      return <p role="status">Not enough browser storage to save this book.</p>;
  }
}
