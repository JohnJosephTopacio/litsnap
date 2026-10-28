// Downloads one lookup image for the grid, to be shown as a blob: URL (GRID-2). Books inherit our
// CSP, so images aren't embedded from Wikimedia: see docs/decisions/0005.

/** The only host the CSP lets our code fetch images from (connect-src, decision 0005). */
const IMAGE_ORIGIN = 'https://upload.wikimedia.org/';

/** Rejects if the URL isn't on Wikimedia, the download fails, or it isn't an image. */
export async function loadImage(
  url: string,
  signal: AbortSignal,
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
): Promise<Blob> {
  if (!url.startsWith(IMAGE_ORIGIN)) throw new Error('Not a Wikimedia image URL');
  // No cookies, and no referrer: Wikimedia needn't know which page the reader is on (spec §7).
  const response = await fetchImpl(url, {
    mode: 'cors',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    signal,
  });
  if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
  if (!response.headers.get('Content-Type')?.startsWith('image/')) throw new Error('Not an image');
  return response.blob();
}
