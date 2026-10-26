// The mock lookup client used by `pnpm dev` and the LookupModal tests (lookup-modal.md, "Content").
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createMockLookupClient, MOCK_TERMS } from './mockClient';

const client = createMockLookupClient({ delayMs: 0 });
const lookup = (term: string, kind: 'definition' | 'image' | 'both') =>
  client.lookup(term, kind, new AbortController().signal);

describe('createMockLookupClient', () => {
  it('returns only the sections that were asked for', async () => {
    expect(Object.keys(await lookup(MOCK_TERMS.found, 'definition'))).toEqual([
      'term',
      'definition',
    ]);
    expect(Object.keys(await lookup(MOCK_TERMS.found, 'image'))).toEqual(['term', 'images']);
    expect(Object.keys(await lookup(MOCK_TERMS.found, 'both'))).toEqual([
      'term',
      'definition',
      'images',
    ]);
  });

  it('has a dictionary definition, a Wikipedia one, and none', async () => {
    const found = await lookup(MOCK_TERMS.found, 'definition');
    expect(found.definition).toMatchObject({ status: 'found', from: 'dictionary' });
    const wikipedia = await lookup(MOCK_TERMS.wikipedia, 'definition');
    expect(wikipedia.definition).toMatchObject({ status: 'found', from: 'wikipedia' });
    const missing = await lookup('zzyzx', 'definition');
    expect(missing).toEqual({ term: 'zzyzx', definition: { status: 'not-found' } });
  });

  it('says it is sample data, so nobody mistakes it for a real source', async () => {
    const found = await lookup(MOCK_TERMS.found, 'definition');
    expect(found.definition?.status === 'found' && found.definition.source.sourceName).toMatch(
      /sample/i,
    );
  });

  it('finds no images (the grid is M4)', async () => {
    expect((await lookup(MOCK_TERMS.found, 'image')).images).toEqual({ status: 'not-found' });
  });

  it('fails for the error term', async () => {
    await expect(lookup(MOCK_TERMS.error, 'both')).rejects.toThrow();
  });

  it('rejects with an AbortError when aborted while waiting', async () => {
    const slow = createMockLookupClient({ delayMs: 10_000 });
    const controller = new AbortController();
    const pending = slow.lookup(MOCK_TERMS.found, 'definition', controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});
