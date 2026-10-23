// Builds small EPUBs in memory for tests, so each test shows exactly which files its book contains.
import { strToU8, zipSync, type Zippable } from 'fflate';

export const FONT_OBFUSCATION_IDPF = 'http://www.idpf.org/2008/embedding';
export const FONT_OBFUSCATION_ADOBE = 'http://ns.adobe.com/pdf/enc#RC';
export const AES_128_CBC = 'http://www.w3.org/2001/04/xmlenc#aes128-cbc';

const CONTAINER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

const CONTENT_OPF = `<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" unique-identifier="uid" xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:00000000-0000-4000-8000-000000000000</dc:identifier>
    <dc:title>Test Book</dc:title>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="ch1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
  </spine>
</package>`;

const CHAPTER_XHTML = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>One</title></head>
<body><p>It was a hipped roof.</p></body></html>`;

export interface BuildEpubOptions {
  /** Extra or replacement files, keyed by path inside the ZIP. */
  files?: Record<string, string>;
  /** Paths to leave out of the default book (e.g. `META-INF/container.xml`). */
  omit?: string[];
}

/** A minimal valid EPUB 3, plus whatever `options` add or remove. */
export function buildEpub(options: BuildEpubOptions = {}): Blob {
  const files: Record<string, string> = {
    'META-INF/container.xml': CONTAINER_XML,
    'OEBPS/content.opf': CONTENT_OPF,
    'OEBPS/chapter1.xhtml': CHAPTER_XHTML,
    ...options.files,
  };
  const omit = new Set(options.omit);

  // The EPUB spec requires `mimetype` first and uncompressed.
  const zippable: Zippable = { mimetype: [strToU8('application/epub+zip'), { level: 0 }] };
  for (const [path, content] of Object.entries(files)) {
    if (!omit.has(path)) zippable[path] = strToU8(content);
  }

  return new Blob([zipSync(zippable)], { type: 'application/epub+zip' });
}

/**
 * An `encryption.xml` with one `EncryptedData` entry per algorithm.
 * `prefix` controls the XML Encryption namespace prefix ('' = default namespace),
 * because real books differ and the namespace, not the prefix, is what matters.
 */
export function encryptionXml(algorithms: string[], prefix = 'enc'): string {
  const p = prefix ? `${prefix}:` : '';
  const xmlns = prefix ? `xmlns:${prefix}` : 'xmlns';
  const entries = algorithms
    .map(
      (algorithm, i) => `
  <${p}EncryptedData ${xmlns}="http://www.w3.org/2001/04/xmlenc#">
    <${p}EncryptionMethod Algorithm="${algorithm}"/>
    <${p}CipherData><${p}CipherReference URI="OEBPS/file${String(i)}"/></${p}CipherData>
  </${p}EncryptedData>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container">${entries}
</encryption>`;
}
