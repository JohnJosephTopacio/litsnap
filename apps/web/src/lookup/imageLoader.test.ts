// GRID-2 from docs/features/image-grid.md: how the grid downloads an image.
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { loadImage } from './imageLoader';

const THUMB = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Barn.jpg/330px-Barn.jpg';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

/** A `fetch` that answers `response` and records what it was asked. */
function fakeFetch(response: () => Response) {
  return vi.fn<typeof fetch>(() => Promise.resolve(response()));
}

const image = (type = 'image/png', status = 200) =>
  new Response(PNG, { status, headers: { 'Content-Type': type } });

describe('GRID-2: our code downloads the images', () => {
  it('fetches without cookies or referrer, with CORS, and passes the signal on', async () => {
    const fetch = fakeFetch(() => image());
    const signal = new AbortController().signal;

    const blob = await loadImage(THUMB, signal, fetch);

    expect(blob.type).toBe('image/png');
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(PNG);
    expect(fetch).toHaveBeenCalledWith(THUMB, {
      mode: 'cors',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal,
    });
  });

  it.each([
    'https://thumb.wikimedia.org/wikipedia/commons/a/ab/Barn.jpg',
    'http://upload.wikimedia.org/wikipedia/commons/a/ab/Barn.jpg',
    'https://upload.wikimedia.org.example.org/Barn.jpg',
    'https://example.org/https://upload.wikimedia.org/Barn.jpg',
    'blob:https://litsnap.pages.dev/1234',
  ])('rejects %s without a request', async (url) => {
    const fetch = fakeFetch(() => image());

    await expect(loadImage(url, new AbortController().signal, fetch)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['a 404', () => image('image/png', 404)],
    ['an HTML error page', () => image('text/html')],
    ['no content type', () => new Response(PNG, { status: 200, headers: {} })],
  ])('rejects %s', async (_name, response) => {
    await expect(
      loadImage(THUMB, new AbortController().signal, fakeFetch(response)),
    ).rejects.toThrow();
  });

  it('rejects when the download fails', async () => {
    const fetch = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')));

    await expect(loadImage(THUMB, new AbortController().signal, fetch)).rejects.toThrow(
      'Failed to fetch',
    );
  });

  it("uses the browser's fetch by default", async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(image('image/jpeg'));

    expect((await loadImage(THUMB, new AbortController().signal)).type).toBe('image/jpeg');
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});
