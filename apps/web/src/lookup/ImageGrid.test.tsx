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
  it("shows each image in the Worker's order, with its alt text, and no buttons yet", async () => {
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
    expect(screen.queryAllByRole('button')).toEqual([]);
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
  it("holds each image's place, with its aspect ratio, until it has downloaded", () => {
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
    expect(places[0]?.querySelector('.image-frame')).toHaveStyle({ aspectRatio: '1000 / 800' });
    expect(places[1]?.querySelector('.image-frame')).toHaveStyle({ aspectRatio: '300 / 900' });
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
