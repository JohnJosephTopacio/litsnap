// @vitest-environment node
// Node: inspectEpub reads the file's bytes, and jsdom's File doesn't support that reliably.
import { describe, expect, it } from 'vitest';
import { buildEpubBytes } from '../epub/testing/buildEpub';
import { checkFile, looksLikeEpub } from './checkFile';

const file = (name: string, bytes: BlobPart = 'x', type = '') => new File([bytes], name, { type });

describe('looksLikeEpub', () => {
  it.each([
    ['book.epub', ''],
    ['BOOK.EPUB', ''],
    ['no-extension', 'application/epub+zip'],
  ])('accepts %s (%s)', (name, type) => {
    expect(looksLikeEpub(file(name, 'x', type))).toBe(true);
  });

  it.each([
    ['book.pdf', 'application/pdf'],
    ['notes.txt', 'text/plain'],
    ['book.epub.zip', 'application/zip'],
  ])('rejects %s (%s)', (name, type) => {
    expect(looksLikeEpub(file(name, 'x', type))).toBe(false);
  });
});

describe('checkFile', () => {
  it('RD-3: a PDF is unsupported, without inspecting it', async () => {
    expect(await checkFile(file('book.pdf', '%PDF-1.7'))).toBe('unsupported');
  });

  it('RD-4: an EPUB with DRM markers is drm', async () => {
    const bytes = buildEpubBytes({ files: { 'META-INF/rights.xml': '<rights/>' } });

    expect(await checkFile(file('locked.epub', bytes))).toBe('drm');
  });

  it('RD-5: a corrupt .epub is invalid', async () => {
    expect(await checkFile(file('corrupt.epub', 'not a zip at all'))).toBe('invalid');
  });

  it('a valid EPUB has no problem', async () => {
    expect(await checkFile(file('fine.epub', buildEpubBytes()))).toBeUndefined();
  });
});
