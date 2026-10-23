// The DRM tests below are expected to fail until inspectEpub is implemented. These tests make sure
// they fail because of inspectEpub, not because the fixtures are broken.
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { AES_128_CBC, buildEpub, encryptionXml } from './buildEpub';

async function unzip(blob: Blob) {
  return unzipSync(new Uint8Array(await blob.arrayBuffer()));
}

describe('buildEpub (test helper)', () => {
  it('builds a ZIP whose first entry is an uncompressed mimetype', async () => {
    const bytes = new Uint8Array(await buildEpub().arrayBuffer());
    const files = unzipSync(bytes);

    expect(Object.keys(files)[0]).toBe('mimetype');
    expect(strFromU8(files.mimetype ?? new Uint8Array())).toBe('application/epub+zip');
    // Local file header: compression method (bytes 8–9) 0 = stored.
    expect(bytes[8]).toBe(0);
    expect(bytes[9]).toBe(0);
  });

  it('adds and omits files', async () => {
    const files = await unzip(
      buildEpub({
        files: { 'META-INF/rights.xml': '<rights/>' },
        omit: ['META-INF/container.xml'],
      }),
    );

    expect(files).toHaveProperty(['META-INF/rights.xml']);
    expect(files).not.toHaveProperty(['META-INF/container.xml']);
  });

  it('writes well-formed encryption.xml for any prefix', () => {
    for (const prefix of ['enc', '']) {
      const doc = new DOMParser().parseFromString(
        encryptionXml([AES_128_CBC], prefix),
        'application/xml',
      );

      expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
      const methods = doc.getElementsByTagNameNS(
        'http://www.w3.org/2001/04/xmlenc#',
        'EncryptionMethod',
      );
      expect(methods).toHaveLength(1);
      expect(methods[0]?.getAttribute('Algorithm')).toBe(AES_128_CBC);
    }
  });
});
