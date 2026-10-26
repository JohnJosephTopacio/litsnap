// Test books for Playwright, built in memory. See fixtures/README.md.
import { fileURLToPath } from 'node:url';
import { buildEpubBytes, escapeXml } from '../src/epub/testing/buildEpub';

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

/** RD-24: a TOC whose chapter label is HTML. It must show up as literal text. */
export const hostileTocEpub = () =>
  epub(
    'hostile-toc.epub',
    buildEpubBytes({
      manifest: [
        '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
      ],
      files: {
        'OEBPS/nav.xhtml': `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Contents</title></head>
<body><nav epub:type="toc"><ol>
  <li><a href="chapter1.xhtml">${escapeXml(HOSTILE_TITLE)}</a></li>
</ol></nav></body></html>`,
      },
    }),
  );

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

/** RD-17: publisher CSS that hard-codes colours, plus an image that must not be inverted. */
export const colouredEpub = () =>
  epub(
    'coloured.epub',
    buildEpubBytes({
      manifest: ['<item id="css" href="style.css" media-type="text/css"/>'],
      files: {
        'OEBPS/style.css':
          'body { background: #ffeecc; color: #880000; } p.note { color: #008800; background: #eeeeee; }',
        'OEBPS/chapter1.xhtml': chapter(
          '<link rel="stylesheet" href="style.css"/>',
          `<p>Plain paragraph.</p><p class="note">Coloured paragraph.</p>
<img id="pic" alt="" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"/>`,
        ),
      },
    }),
  );

/** RD-19: a footnote reference in chapter 1 pointing at an endnote in a second section. */
export const footnoteEpub = () =>
  epub(
    'footnote.epub',
    buildEpubBytes({
      manifest: [
        '<item id="notes" href="notes.xhtml" media-type="application/xhtml+xml"/>',
        '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
      ],
      spine: ['notes'],
      files: {
        'OEBPS/chapter1.xhtml': chapter(
          '',
          '<p>A hipped roof<a id="ref-1" href="notes.xhtml#note-1">1</a> slopes on all sides.</p>',
        ),
        'OEBPS/notes.xhtml': chapter(
          '',
          '<section><p id="note-1">Footnote one: also called a hip roof.</p></section>',
        ),
        'OEBPS/nav.xhtml': `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Contents</title></head>
<body><nav epub:type="toc"><ol>
  <li><a href="chapter1.xhtml">Chapter One</a></li>
  <li><a href="notes.xhtml">Endnotes</a></li>
</ol></nav></body></html>`,
      },
    }),
  );

/**
 * RD-27/28: a fixed-layout book. Its page sets its own colours, which must survive any theme.
 * (A real CC0 fixed-layout book as a fixture is part of #17's follow-up.)
 */
export const FIXED_TITLE = 'Fixed Layout Book';
export const fixedLayoutEpub = () =>
  epub(
    'fixed-layout.epub',
    buildEpubBytes({
      title: FIXED_TITLE,
      metadata: ['<meta property="rendition:layout">pre-paginated</meta>'],
      files: {
        'OEBPS/chapter1.xhtml': `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Page 1</title>
<meta name="viewport" content="width=600, height=800"/>
<style>body { background: #ffeecc; color: #880000; }</style></head>
<body><p>A fixed page.</p></body></html>`,
      },
    }),
  );

/**
 * RD-29: a cover page whose own CSS absolutely positions a full-width <body>, the pattern from
 * EPUBs converted from online readers. Generated, so no real (copyrighted) book is committed.
 */
export const positionedBodyEpub = () =>
  epub(
    'positioned-body.epub',
    buildEpubBytes({
      files: {
        // The cover page's layout CSS, verbatim from such a book; the image is a blank 600×900 SVG.
        'OEBPS/chapter1.xhtml': chapter(
          `<style>body{display:table;position:absolute;margin:0!important;height:100%;width:100%;}
#Cover{display:table-cell;vertical-align:middle;text-align:center;}
img{height:90vh;margin-left:auto;margin-right:auto;}</style>
<style>body{margin:1em;background-color:transparent!important;}</style>`,
          `<div id="Cover"><img id="cover" alt="Cover text" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='900'%3E%3Crect width='600' height='900' fill='%23048'/%3E%3C/svg%3E"/></div>`,
        ),
      },
    }),
  );

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

/**
 * Selection menu and lookup modal: a short sentence to select in, a 10-word one, and markup that
 * is only text (MODAL-2 renders it as text), all on one page.
 */
export const lookupEpub = () =>
  epub(
    'lookup.epub',
    buildEpubBytes({
      files: {
        'OEBPS/chapter1.xhtml': chapter(
          '',
          `<p>The house had a hipped roof and two chimneys.</p>
<p>One two three four five six seven eight nine ten.</p>
<p>Careful: &lt;img src=x onerror="top.localStorage.setItem('pwned-modal', 1)"&gt; is just text.</p>`,
        ),
      },
    }),
  );
