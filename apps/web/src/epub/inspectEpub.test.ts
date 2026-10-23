// Acceptance criteria from docs/features/drm-detection.md.
//
// RED PHASE: every test is `it.fails` because inspectEpub is a stub. The implementation PR turns
// each `it.fails` into `it` and changes nothing else, so the review can confirm the tests weren't
// weakened to make them pass.
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { inspectEpub } from './inspectEpub';
import {
  AES_128_CBC,
  buildEpub,
  encryptionXml,
  FONT_OBFUSCATION_ADOBE,
  FONT_OBFUSCATION_IDPF,
} from './testing/buildEpub';

const ENCRYPTION = 'META-INF/encryption.xml';

describe('inspectEpub', () => {
  describe('DRM-1: DRM-free book', () => {
    it('is ok without encryption.xml', async () => {
      expect(await inspectEpub(buildEpub())).toEqual({ status: 'ok' });
    });
  });

  describe('DRM-2: font obfuscation is not DRM', () => {
    it('is ok with IDPF and Adobe font obfuscation', async () => {
      const epub = buildEpub({
        files: { [ENCRYPTION]: encryptionXml([FONT_OBFUSCATION_IDPF, FONT_OBFUSCATION_ADOBE]) },
      });

      expect(await inspectEpub(epub)).toEqual({ status: 'ok' });
    });

    it('is ok when encryption.xml uses the default namespace instead of a prefix', async () => {
      const epub = buildEpub({
        files: { [ENCRYPTION]: encryptionXml([FONT_OBFUSCATION_IDPF], '') },
      });

      expect(await inspectEpub(epub)).toEqual({ status: 'ok' });
    });

    it('is ok when encryption.xml lists nothing', async () => {
      const epub = buildEpub({ files: { [ENCRYPTION]: encryptionXml([]) } });

      expect(await inspectEpub(epub)).toEqual({ status: 'ok' });
    });
  });

  describe('DRM-3: Adobe ADEPT', () => {
    it('is drm/adobe-adept with rights.xml', async () => {
      const epub = buildEpub({ files: { 'META-INF/rights.xml': '<rights/>' } });

      expect(await inspectEpub(epub)).toEqual({ status: 'drm', scheme: 'adobe-adept' });
    });

    it('is still adobe-adept when encryption.xml also lists AES (real ADEPT books do)', async () => {
      const epub = buildEpub({
        files: { 'META-INF/rights.xml': '<rights/>', [ENCRYPTION]: encryptionXml([AES_128_CBC]) },
      });

      expect(await inspectEpub(epub)).toEqual({ status: 'drm', scheme: 'adobe-adept' });
    });
  });

  describe('DRM-4: Readium LCP', () => {
    it('is drm/readium-lcp with license.lcpl', async () => {
      const epub = buildEpub({ files: { 'META-INF/license.lcpl': '{}' } });

      expect(await inspectEpub(epub)).toEqual({ status: 'drm', scheme: 'readium-lcp' });
    });
  });

  describe('DRM-5: Apple FairPlay', () => {
    it('is drm/apple-fairplay with sinf.xml', async () => {
      const epub = buildEpub({ files: { 'META-INF/sinf.xml': '<fairplay:sinf/>' } });

      expect(await inspectEpub(epub)).toEqual({ status: 'drm', scheme: 'apple-fairplay' });
    });
  });

  describe('DRM-6: unknown encryption', () => {
    it('is drm/unknown-encryption with AES', async () => {
      const epub = buildEpub({ files: { [ENCRYPTION]: encryptionXml([AES_128_CBC]) } });

      expect(await inspectEpub(epub)).toEqual({ status: 'drm', scheme: 'unknown-encryption' });
    });

    it('is drm/unknown-encryption when AES sits alongside font obfuscation', async () => {
      const epub = buildEpub({
        files: { [ENCRYPTION]: encryptionXml([FONT_OBFUSCATION_IDPF, AES_128_CBC]) },
      });

      expect(await inspectEpub(epub)).toEqual({ status: 'drm', scheme: 'unknown-encryption' });
    });
  });

  describe('DRM-7: not a ZIP', () => {
    it('is invalid for a PDF renamed to .epub', async () => {
      const pdf = new Blob(['%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n']);

      expect(await inspectEpub(pdf)).toEqual({ status: 'invalid' });
    });

    it('is invalid for random bytes', async () => {
      const bytes = new Uint8Array(256).map((_, i) => (i * 37 + 11) % 256);

      expect(await inspectEpub(new Blob([bytes]))).toEqual({ status: 'invalid' });
    });

    it('is invalid for an empty file', async () => {
      expect(await inspectEpub(new Blob([]))).toEqual({ status: 'invalid' });
    });
  });

  describe('DRM-8: ZIP but not an EPUB', () => {
    it('is invalid without META-INF/container.xml', async () => {
      const epub = buildEpub({ omit: ['META-INF/container.xml'] });

      expect(await inspectEpub(epub)).toEqual({ status: 'invalid' });
    });

    it('is invalid for an unrelated ZIP', async () => {
      const zip = new Blob([zipSync({ 'notes.txt': strToU8('hello') })]);

      expect(await inspectEpub(zip)).toEqual({ status: 'invalid' });
    });

    it('checks container.xml before DRM markers', async () => {
      const epub = buildEpub({
        files: { 'META-INF/rights.xml': '<rights/>' },
        omit: ['META-INF/container.xml'],
      });

      expect(await inspectEpub(epub)).toEqual({ status: 'invalid' });
    });
  });

  describe('DRM-9: unparseable encryption.xml', () => {
    it('is drm/unknown-encryption when encryption.xml is malformed', async () => {
      const epub = buildEpub({
        files: { [ENCRYPTION]: '<encryption><EncryptedData></encryption' },
      });

      expect(await inspectEpub(epub)).toEqual({ status: 'drm', scheme: 'unknown-encryption' });
    });
  });
});
