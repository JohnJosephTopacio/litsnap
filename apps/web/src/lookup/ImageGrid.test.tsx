// GRID-1, 3…7 from docs/features/image-grid.md, with a fake loader. jsdom has no
// URL.createObjectURL, so it's stubbed here; the real blob: path is in e2e/image-grid.spec.ts.
import type { LookupImage } from '@litsnap/shared';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageGrid } from './ImageGrid';

const image = (name: string, overrides: Partial<LookupImage> = {}): LookupImage => ({
  thumbUrl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${name}.jpg/330px-${name}.jpg`,
  fullUrl: `https://upload.wikimedia.org/wikipedia/commons/a/ab/${name}.jpg`,
  alt: `A photo of the ${name.toLowerCase()}`,
  title: name,
  mime: 'image/jpeg',
  width: 1000,
  height: 800,
  attribution: {
    author: 'Sample Author',
    licence: 'CC BY-SA 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
    sourceName: 'Wikimedia Commons',
    sourceUrl: `https://commons.wikimedia.org/wiki/File:${name}.jpg`,
  },
  ...overrides,
});

/** A loader whose downloads finish only when the test says so. */
function controlledLoader() {
  const calls: {
    url: string;
    signal: AbortSignal;
    resolve: () => void;
    reject: () => void;
  }[] = [];
  const load = vi.fn(
    (url: string, signal: AbortSignal) =>
      new Promise<Blob>((resolve, reject) => {
        calls.push({
          url,
          signal,
          resolve: () => {
            resolve(new Blob(['x'], { type: 'image/jpeg' }));
          },
          reject: () => {
            reject(new Error('404'));
          },
        });
      }),
  );
  return { load, calls };
}

/** Runs `step` (finishing downloads) and lets React render what follows. */
async function settle(step: () => void) {
  await act(async () => {
    step();
    await Promise.resolve();
    await Promise.resolve();
  });
}

let made: string[] = [];
let revoked: string[] = [];

beforeEach(() => {
  made = [];
  revoked = [];
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: () => {
      made.push(`blob:test/${String(made.length + 1)}`);
      return made.at(-1);
    },
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: (url: string) => {
      revoked.push(url);
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const images = () => screen.queryAllByRole('img');

describe('GRID-1: a grid of thumbnails', () => {
  it("shows each image in the Worker's order, with its alt text", async () => {
    const { load, calls } = controlledLoader();
    render(<ImageGrid images={[image('Barn'), image('Mill'), image('Hut')]} load={load} />);

    await settle(() => {
      for (const call of [...calls].reverse()) call.resolve();
    });

    expect(images().map((img) => img.getAttribute('alt'))).toEqual([
      'A photo of the barn',
      'A photo of the mill',
      'A photo of the hut',
    ]);
  });
});

describe('GRID-2: our code downloads the images (the grid side)', () => {
  it('asks the loader for each thumbnail and shows the blob: URL it made', async () => {
    const { load, calls } = controlledLoader();
    render(<ImageGrid images={[image('Barn'), image('Mill')]} load={load} />);

    await settle(() => {
      for (const call of calls) call.resolve();
    });

    expect(calls.map(({ url }) => url)).toEqual([image('Barn').thumbUrl, image('Mill').thumbUrl]);
    expect(images().map((img) => img.getAttribute('src'))).toEqual(made);
    expect(made).toHaveLength(2);
  });
});

describe('GRID-3: placeholders keep the grid still', () => {
  it("holds each image's place until it has downloaded, square whatever the image's shape (GRID-10)", () => {
    const { load } = controlledLoader();
    render(
      <ImageGrid
        images={[image('Barn'), image('Tower', { width: 300, height: 900 })]}
        load={load}
      />,
    );

    const places = screen.getAllByRole('listitem');
    expect(places).toHaveLength(2);
    expect(images()).toEqual([]);
    // The square comes from CSS (GRID-10): no per-image shape inline, which would override it.
    for (const place of places) {
      expect(place.querySelector('.image-frame')?.getAttribute('style')).toBeNull();
    }
  });
});

describe('GRID-4: a broken image is left out', () => {
  it('drops an image whose download failed, with its credit', async () => {
    const { load, calls } = controlledLoader();
    render(<ImageGrid images={[image('Barn'), image('Gone'), image('Hut')]} load={load} />);

    await settle(() => {
      calls[0]?.resolve();
      calls[1]?.reject();
      calls[2]?.resolve();
    });

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(images().map((img) => img.getAttribute('alt'))).toEqual([
      'A photo of the barn',
      'A photo of the hut',
    ]);
  });

  it("drops an image the browser can't decode", async () => {
    const { load, calls } = controlledLoader();
    render(<ImageGrid images={[image('Barn'), image('Garbled')]} load={load} />);
    await settle(() => {
      for (const call of calls) call.resolve();
    });

    fireEvent.error(screen.getByRole('img', { name: 'A photo of the garbled' }));

    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('says "No good image found." when none are left', async () => {
    const { load, calls } = controlledLoader();
    render(<ImageGrid images={[image('Gone'), image('Lost')]} load={load} />);

    await settle(() => {
      for (const call of calls) call.reject();
    });

    expect(screen.getByText('No good image found.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
  });
});

describe('GRID-5: every thumbnail is credited', () => {
  it('links the author to the file page and the licence to its text, in new tabs', () => {
    render(<ImageGrid images={[image('Barn')]} load={controlledLoader().load} />);

    const credit = screen.getByText(
      (_text, element) => element?.classList.contains('image-credit') ?? false,
    );
    expect(credit).toHaveTextContent('Sample Author · CC BY-SA 4.0');
    const author = within(credit).getByRole('link', { name: 'Sample Author' });
    const licence = within(credit).getByRole('link', { name: 'CC BY-SA 4.0' });
    expect(author).toHaveAttribute('href', 'https://commons.wikimedia.org/wiki/File:Barn.jpg');
    expect(licence).toHaveAttribute('href', 'https://creativecommons.org/licenses/by-sa/4.0');
    for (const link of [author, licence]) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });

  it('keeps the whole credit, with the title, in the tooltip', () => {
    render(<ImageGrid images={[image('Barn')]} load={controlledLoader().load} />);

    expect(document.querySelector('.image-credit')).toHaveAttribute(
      'title',
      'Barn, by Sample Author, CC BY-SA 4.0, from Wikimedia Commons',
    );
  });

  it('shows a licence without a URL, and a non-web source, as plain text', () => {
    render(
      <ImageGrid
        images={[
          {
            ...image('Barn'),
            attribution: {
              author: '<b>Bold</b> Author',
              licence: 'Public domain',
              sourceName: 'Wikimedia Commons',
              sourceUrl: 'javascript:alert(1)',
            },
          },
        ]}
        load={controlledLoader().load}
      />,
    );

    expect(screen.queryAllByRole('link')).toEqual([]);
    expect(document.querySelector('.image-credit')).toHaveTextContent(
      '<b>Bold</b> Author · Public domain',
    );
    expect(document.querySelector('.image-credit b')).toBeNull();
  });
});

describe('GRID-6: no animation for readers who asked for less motion', () => {
  const reduceMotion = (matches: boolean) =>
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query) =>
        ({
          matches: matches && query === '(prefers-reduced-motion: reduce)',
          media: query,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        }) as unknown as MediaQueryList,
    );
  const gif = image('Spin', { mime: 'image/gif' });

  it('leaves GIFs out, without downloading them', () => {
    reduceMotion(true);
    const { load, calls } = controlledLoader();
    render(<ImageGrid images={[image('Barn'), gif]} load={load} />);

    expect(calls.map(({ url }) => url)).toEqual([image('Barn').thumbUrl]);
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('says "No good image found." if only GIFs were found', () => {
    reduceMotion(true);
    render(<ImageGrid images={[gif]} load={controlledLoader().load} />);

    expect(screen.getByText('No good image found.')).toBeInTheDocument();
  });

  it('shows GIFs to everyone else', () => {
    reduceMotion(false);
    const { load, calls } = controlledLoader();
    render(<ImageGrid images={[gif]} load={load} />);

    expect(calls.map(({ url }) => url)).toEqual([gif.thumbUrl]);
  });
});

describe('GRID-7: nothing left behind', () => {
  it('aborts downloads in progress and revokes every blob: URL when it goes', async () => {
    const { load, calls } = controlledLoader();
    const { unmount } = render(<ImageGrid images={[image('Barn'), image('Mill')]} load={load} />);
    await settle(() => {
      calls[0]?.resolve();
    });

    unmount();

    expect(calls.map(({ signal }) => signal.aborted)).toEqual([true, true]);
    expect(revoked).toEqual(made);
    expect(made).toHaveLength(1);
  });

  it('makes no blob: URL for a download that finishes after the grid has gone', async () => {
    const { load, calls } = controlledLoader();
    const { unmount } = render(<ImageGrid images={[image('Barn')]} load={load} />);

    unmount();
    await settle(() => {
      calls[0]?.resolve();
    });

    expect(made).toEqual([]);
  });

  it('revokes the URL of an image the browser could not decode', async () => {
    const { load, calls } = controlledLoader();
    render(<ImageGrid images={[image('Garbled')]} load={load} />);
    await settle(() => {
      calls[0]?.resolve();
    });

    fireEvent.error(screen.getByRole('img'));

    expect(revoked).toEqual(made);
  });
});

// VIEW-1…6 from docs/features/image-viewer.md. Esc against the real <dialog>, and the book staying
// put (VIEW-7), are in e2e/image-viewer.spec.ts.

/** The grid with `names`, every thumbnail downloaded. */
async function loadedGrid(names: string[], overrides: Record<string, Partial<LookupImage>> = {}) {
  const loader = controlledLoader();
  const view = render(
    <ImageGrid images={names.map((name) => image(name, overrides[name]))} load={loader.load} />,
  );
  await settle(() => {
    for (const call of loader.calls) call.resolve();
  });
  return { ...loader, ...view };
}

const enlarge = (alt: string) => screen.getByRole('button', { name: `Enlarge: ${alt}` });
const shown = () => screen.getByRole('img');
const viewer = () => screen.getByRole('group', { name: 'Enlarged image' });
const back = () => screen.getByRole('button', { name: '← Back to images' });

describe('VIEW-1: thumbnails are buttons', () => {
  it('names each button after its image', async () => {
    await loadedGrid(['Barn', 'Mill']);

    expect(enlarge('A photo of the barn')).toBeInTheDocument();
    expect(enlarge('A photo of the mill')).toBeInTheDocument();
  });
});

describe('VIEW-2: the enlarged view', () => {
  it('replaces the grid with the image, its caption, position and full credit', async () => {
    await loadedGrid(['Barn', 'Mill', 'Hut']);

    fireEvent.click(enlarge('A photo of the mill'));

    expect(screen.queryByRole('list')).toBeNull();
    expect(shown()).toHaveAttribute('alt', 'A photo of the mill');
    expect(viewer().querySelector('figcaption')).toHaveTextContent('A photo of the mill');
    expect(within(viewer()).getByText('2 of 3')).toBeInTheDocument();
    expect(viewer().querySelector('.viewer-credit')).toHaveTextContent(
      'Mill · by Sample Author · CC BY-SA 4.0 · View on Wikimedia Commons',
    );
    const licence = screen.getByRole('link', { name: 'CC BY-SA 4.0' });
    const source = screen.getByRole('link', { name: 'View on Wikimedia Commons' });
    expect(licence).toHaveAttribute('href', 'https://creativecommons.org/licenses/by-sa/4.0');
    expect(source).toHaveAttribute('href', 'https://commons.wikimedia.org/wiki/File:Mill.jpg');
    for (const link of [licence, source]) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });

  it('shows the thumbnail at once, then the large image when it has downloaded', async () => {
    const { calls } = await loadedGrid(['Barn']);
    const thumbnail = shown().getAttribute('src');

    fireEvent.click(enlarge('A photo of the barn'));
    expect(shown()).toHaveAttribute('src', thumbnail);
    expect(calls.at(-1)?.url).toBe(image('Barn').fullUrl);
    await settle(() => {
      calls.at(-1)?.resolve();
    });

    expect(shown().getAttribute('src')).toBe(made.at(-1));
    expect(shown().getAttribute('src')).not.toBe(thumbnail);
  });

  it('links only web URLs, and shows the credit as text', async () => {
    const barn = image('Barn');
    await loadedGrid(['Barn'], {
      Barn: {
        title: '<i>Barn</i>',
        attribution: {
          ...barn.attribution,
          licenceUrl: 'javascript:alert(1)',
          sourceUrl: 'data:,x',
        },
      },
    });

    fireEvent.click(enlarge('A photo of the barn'));

    expect(screen.queryAllByRole('link')).toEqual([]);
    expect(viewer().querySelector('.viewer-credit')).toHaveTextContent(
      '<i>Barn</i> · by Sample Author',
    );
    expect(viewer().querySelector('.viewer-credit i')).toBeNull();
  });
});

describe('VIEW-3: going back', () => {
  it('focuses Back, which shows the grid with focus on the image that was showing', async () => {
    await loadedGrid(['Barn', 'Mill']);
    fireEvent.click(enlarge('A photo of the barn'));

    expect(back()).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(back());

    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(enlarge('A photo of the mill')).toHaveFocus();
  });
});

describe('VIEW-4: stepping through', () => {
  it('Previous and Next, disabled at the ends', async () => {
    await loadedGrid(['Barn', 'Mill']);
    fireEvent.click(enlarge('A photo of the barn'));
    const previous = () => screen.getByRole('button', { name: 'Previous' });
    const next = () => screen.getByRole('button', { name: 'Next' });

    expect(previous()).toBeDisabled();
    fireEvent.click(next());
    expect(shown()).toHaveAttribute('alt', 'A photo of the mill');
    expect(next()).toBeDisabled();
    fireEvent.click(previous());
    expect(shown()).toHaveAttribute('alt', 'A photo of the barn');
  });

  it('← and →, without wrapping around', async () => {
    await loadedGrid(['Barn', 'Mill']);
    fireEvent.click(enlarge('A photo of the barn'));

    fireEvent.keyDown(viewer(), { key: 'ArrowLeft' });
    expect(shown()).toHaveAttribute('alt', 'A photo of the barn');
    fireEvent.keyDown(viewer(), { key: 'ArrowRight' });
    expect(shown()).toHaveAttribute('alt', 'A photo of the mill');
    fireEvent.keyDown(viewer(), { key: 'ArrowRight' });
    expect(shown()).toHaveAttribute('alt', 'A photo of the mill');
    fireEvent.keyDown(viewer(), { key: 'ArrowLeft' });
    expect(shown()).toHaveAttribute('alt', 'A photo of the barn');
  });

  it('skips images the grid left out', async () => {
    const { load, calls } = controlledLoader();
    render(<ImageGrid images={[image('Barn'), image('Gone'), image('Hut')]} load={load} />);
    await settle(() => {
      calls[0]?.resolve();
      calls[1]?.reject();
      calls[2]?.resolve();
    });

    fireEvent.click(enlarge('A photo of the barn'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(shown()).toHaveAttribute('alt', 'A photo of the hut');
    expect(within(viewer()).getByText('2 of 2')).toBeInTheDocument();
  });
});

describe('VIEW-5: Esc goes back before it closes (the viewer side)', () => {
  it('goes back to the grid and cancels the Esc, so the dialog stays open', async () => {
    await loadedGrid(['Barn']);
    fireEvent.click(enlarge('A photo of the barn'));

    const notCancelled = fireEvent.keyDown(viewer(), { key: 'Escape' });

    expect(notCancelled).toBe(false);
    expect(screen.getByRole('list')).toBeInTheDocument();
  });
});

describe("VIEW-6: the large image's download", () => {
  it('downloads it once, however often the image is opened', async () => {
    const { calls } = await loadedGrid(['Barn']);
    fireEvent.click(enlarge('A photo of the barn'));
    await settle(() => {
      calls.at(-1)?.resolve();
    });
    fireEvent.click(back());
    fireEvent.click(enlarge('A photo of the barn'));

    expect(calls.filter(({ url }) => url === image('Barn').fullUrl)).toHaveLength(1);
  });

  it('keeps the thumbnail if it fails', async () => {
    const { calls } = await loadedGrid(['Barn']);
    const thumbnail = shown().getAttribute('src');
    fireEvent.click(enlarge('A photo of the barn'));

    await settle(() => {
      calls.at(-1)?.reject();
    });

    expect(shown()).toHaveAttribute('src', thumbnail);
  });

  it("doesn't download a small original twice", async () => {
    const small = image('Tiny').thumbUrl;
    const { calls } = await loadedGrid(['Tiny'], { Tiny: { fullUrl: small } });

    fireEvent.click(enlarge('A photo of the tiny'));

    expect(calls.map(({ url }) => url)).toEqual([small]);
  });

  it('aborts the download and revokes its URL when the grid goes', async () => {
    const { calls, unmount } = await loadedGrid(['Barn', 'Mill']);
    fireEvent.click(enlarge('A photo of the barn'));
    await settle(() => {
      calls.at(-1)?.resolve();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    const pending = calls.at(-1);

    unmount();

    expect(pending?.url).toBe(image('Mill').fullUrl);
    expect(pending?.signal.aborted).toBe(true);
    expect(made).toHaveLength(3);
    expect(revoked).toEqual(made);
  });
});

describe('VIEW-6: a late download', () => {
  it('makes no blob: URL for a large image that arrives after the grid has gone', async () => {
    const { calls, unmount } = await loadedGrid(['Barn']);
    fireEvent.click(enlarge('A photo of the barn'));
    const pending = calls.at(-1);
    const before = made.length;

    unmount();
    await settle(() => {
      pending?.resolve();
    });

    expect(made).toHaveLength(before);
  });
});
