// Test books for Playwright, built in memory. See fixtures/README.md.
import { fileURLToPath } from 'node:url';
import { buildEpubBytes } from '../src/epub/testing/buildEpub';

export interface FixtureFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

const epub = (name: string, bytes: Uint8Array): FixtureFile => ({
  name,
  mimeType: 'application/epub+zip',
  buffer: Buffer.from(bytes),
});

const chapter = (head: string, body: string) => `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter</title>${head}</head>
<body>${body}</body></html>`;

/** A real Standard Ebooks title (CC0), committed as a file. */
export const JEKYLL = fileURLToPath(new URL('./fixtures/jekyll-and-hyde.epub', import.meta.url));
export const JEKYLL_TITLE = 'The Strange Case of Dr. Jekyll and Mr. Hyde';

/** Keys a successful attack would write to localStorage (RD-21). */
export const PWNED_KEYS = ['pwned-inline', 'pwned-blob-script', 'pwned-onerror', 'pwned-link'];

/**
 * RD-21: tries every route for running code from a book. foliate turns `<script src="evil.js">`
 * into a blob: URL (epub.js rewrites every [src]), so that's the blob-script route.
 */
export const scriptedEpub = () =>
  epub(
    'scripted.epub',
    buildEpubBytes({
      title: 'Scripted Book',
      manifest: ['<item id="evil" href="evil.js" media-type="application/javascript"/>'],
      files: {
        'OEBPS/evil.js': "top.localStorage.setItem('pwned-blob-script', '1');",
        'OEBPS/chapter1.xhtml': chapter(
          `<script>top.localStorage.setItem('pwned-inline', '1');</script>
<script src="evil.js"></script>`,
          `<p>A perfectly ordinary chapter.</p>
<img src="missing.png" alt="" onerror="top.localStorage.setItem('pwned-onerror', '1')"/>
<p><a href="javascript:top.localStorage.setItem('pwned-link', '1')">An innocent link</a></p>`,
        ),
      },
    }),
  );

/** RD-22: a book that would load an image from a remote host. */
export const REMOTE_HOST = 'tracker.example';
export const remoteImageEpub = () =>
  epub(
    'remote-image.epub',
    buildEpubBytes({
      files: {
        'OEBPS/chapter1.xhtml': chapter(
          '',
          `<p>Pixel below.</p><img src="https://${REMOTE_HOST}/pixel.png" alt=""/>`,
        ),
      },
    }),
  );

/** RD-24: metadata that is HTML. It must show up as literal text. */
export const HOSTILE_TITLE = '<img src=x onerror="top.localStorage.setItem(\'pwned-title\', 1)">';
export const hostileTitleEpub = () =>
  epub('hostile-title.epub', buildEpubBytes({ title: HOSTILE_TITLE }));

/** RD-4: a DRM marker (Adobe ADEPT's rights.xml). Nothing is actually encrypted. */
export const fakeDrmEpub = () =>
  epub('fake-drm.epub', buildEpubBytes({ files: { 'META-INF/rights.xml': '<rights/>' } }));

/** RD-5: named .epub, but not a ZIP. */
export const corruptEpub = (): FixtureFile => ({
  name: 'corrupt.epub',
  mimeType: 'application/epub+zip',
  buffer: Buffer.from('This is not a ZIP file, whatever its name says.'),
});

/** RD-3: not EPUBs. */
export const pdfFile = (): FixtureFile => ({
  name: 'paper.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.7\n%%EOF\n'),
});
export const textFile = (): FixtureFile => ({
  name: 'notes.txt',
  mimeType: 'text/plain',
  buffer: Buffer.from('Just some notes.'),
});

/** RD-7: a second, small, valid book. */
export const SECOND_TITLE = 'A Second Book';
export const secondEpub = () => epub('second.epub', buildEpubBytes({ title: SECOND_TITLE }));

/** RD-20: one allowed and one disallowed external link. */
export const linksEpub = () =>
  epub(
    'links.epub',
    buildEpubBytes({
      files: {
        'OEBPS/chapter1.xhtml': chapter(
          '',
          `<p><a href="https://standardebooks.org/">Standard Ebooks</a></p>
<p><a href="mailto:someone@example.com">Email someone</a></p>`,
        ),
      },
    }),
  );
