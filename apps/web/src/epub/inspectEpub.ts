// Decides whether an EPUB can be opened, before it is rendered or stored.
// Spec: docs/features/drm-detection.md. This only looks for DRM markers; it never decrypts anything.
import { strFromU8, unzipSync } from 'fflate';

export type DrmScheme = 'adobe-adept' | 'readium-lcp' | 'apple-fairplay' | 'unknown-encryption';

export type EpubInspection =
  { status: 'ok' } | { status: 'drm'; scheme: DrmScheme } | { status: 'invalid' };

const CONTAINER = 'META-INF/container.xml';
const ENCRYPTION = 'META-INF/encryption.xml';

// Checked in order: the first marker present wins.
const DRM_MARKERS: [path: string, scheme: DrmScheme][] = [
  ['META-INF/rights.xml', 'adobe-adept'],
  ['META-INF/license.lcpl', 'readium-lcp'],
  ['META-INF/sinf.xml', 'apple-fairplay'],
];

// Font obfuscation only scrambles embedded fonts. It is not DRM, and many DRM-free books use it.
const FONT_OBFUSCATION = new Set([
  'http://www.idpf.org/2008/embedding',
  'http://ns.adobe.com/pdf/enc#RC',
]);

export async function inspectEpub(file: Blob): Promise<EpubInspection> {
  const entries = new Set<string>();
  let encryptionXml: Uint8Array | undefined;
  try {
    // Reads the ZIP's directory, but only decompresses encryption.xml: the filter sees every
    // entry name, and returning false skips that entry's contents.
    const unzipped = unzipSync(new Uint8Array(await file.arrayBuffer()), {
      filter: ({ name }) => {
        entries.add(name);
        return name === ENCRYPTION;
      },
    });
    encryptionXml = unzipped[ENCRYPTION];
  } catch {
    return { status: 'invalid' };
  }

  if (!entries.has(CONTAINER)) return { status: 'invalid' };

  for (const [path, scheme] of DRM_MARKERS) {
    if (entries.has(path)) return { status: 'drm', scheme };
  }

  if (encryptionXml && !onlyFontObfuscation(strFromU8(encryptionXml))) {
    return { status: 'drm', scheme: 'unknown-encryption' };
  }

  return { status: 'ok' };
}

/** True if every `EncryptedData` in encryption.xml uses a font-obfuscation algorithm. */
function onlyFontObfuscation(xml: string): boolean {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  // Malformed XML: we can't show the book is unencrypted (DRM-9).
  if (doc.getElementsByTagName('parsererror').length > 0) return false;

  // Match by local name in any namespace: real books vary in prefixes, and a book that forgets
  // the namespace should still be checked rather than waved through.
  return Array.from(doc.getElementsByTagNameNS('*', 'EncryptedData')).every((data) => {
    // Only the direct child: a nested <KeyInfo><EncryptedKey> has its own EncryptionMethod
    // describing how the key is wrapped, not how the content is encrypted.
    const method = Array.from(data.children).find((el) => el.localName === 'EncryptionMethod');
    const algorithm = method?.getAttribute('Algorithm');
    return algorithm != null && FONT_OBFUSCATION.has(algorithm);
  });
}
