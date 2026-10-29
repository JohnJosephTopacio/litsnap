// The Images section's grid of found images (docs/features/image-grid.md), and the enlarged view
// that replaces it (image-viewer.md). Images are downloaded by our code and shown as blob: URLs,
// never embedded from Wikimedia (decision 0005).
import type { LookupImage } from '@litsnap/shared';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { loadImage } from './imageLoader';

type Load = (url: string, signal: AbortSignal) => Promise<Blob>;

/** Only http(s) links: these URLs come from Wikimedia, i.e. from other sites. */
const isWebUrl = (url: string | undefined): url is string => !!url && /^https?:\/\//i.test(url);

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const link = (href: string | undefined, text: string) =>
  isWebUrl(href) ? (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {text}
    </a>
  ) : (
    text
  );

/** `{author} · {licence}`, linked, with the whole credit in the tooltip (GRID-5). */
function Credit({ image }: { image: LookupImage }) {
  const { author, licence, licenceUrl, sourceName, sourceUrl } = image.attribution;
  const whole = [image.title, author && `by ${author}`, licence, `from ${sourceName}`]
    .filter(Boolean)
    .join(', ');
  return (
    <p className="image-credit" title={whole}>
      {link(sourceUrl, author ?? sourceName)}
      {licence && <> · {link(licenceUrl, licence)}</>}
    </p>
  );
}

/** `{title} · by {author} · {licence} · View on {source}`: the enlarged view's credit (VIEW-2). */
function FullCredit({ image }: { image: LookupImage }) {
  const { author, licence, licenceUrl, sourceName, sourceUrl } = image.attribution;
  const parts = [
    image.title,
    author && `by ${author}`,
    licence && link(licenceUrl, licence),
    link(sourceUrl, `View on ${sourceName}`),
  ].filter(Boolean);
  return (
    <p className="viewer-credit">
      {parts.map((part, index) => (
        <span key={index}>
          {index > 0 && ' · '}
          {part}
        </span>
      ))}
    </p>
  );
}

const ratio = ({ width, height }: LookupImage) => ({
  aspectRatio: `${String(width)} / ${String(height)}`,
});

export function ImageGrid({ images, load = loadImage }: { images: LookupImage[]; load?: Load }) {
  // Readers who asked for less motion get no GIFs, which may be animated (GRID-6).
  const [shown] = useState(() =>
    prefersReducedMotion() ? images.filter(({ mime }) => mime !== 'image/gif') : images,
  );
  /** A blob: URL per downloaded thumbnail. */
  const [urls, setUrls] = useState<ReadonlyMap<string, string>>(new Map());
  /** Thumbnails that couldn't be downloaded or decoded (GRID-4). */
  const [dropped, setDropped] = useState<ReadonlySet<string>>(new Set());
  /** The image shown enlarged, by its thumbnail URL (VIEW-2). */
  const [open, setOpen] = useState<string>();
  /** A blob: URL per downloaded large image (VIEW-6). */
  const [full, setFull] = useState<ReadonlyMap<string, string>>(new Map());
  const fullDownloads = useRef<{ controller: AbortController; asked: Set<string>; made: string[] }>(
    undefined,
  );
  const back = useRef<HTMLButtonElement>(null);
  /** The thumbnail to focus when the grid comes back (VIEW-3). */
  const focusNext = useRef<string>(undefined);

  useEffect(() => {
    const controller = new AbortController();
    const made: string[] = [];
    for (const { thumbUrl } of shown) {
      load(thumbUrl, controller.signal).then(
        (blob) => {
          if (controller.signal.aborted) return;
          const url = URL.createObjectURL(blob);
          made.push(url);
          setUrls((current) => new Map(current).set(thumbUrl, url));
        },
        () => {
          if (!controller.signal.aborted) setDropped((current) => new Set(current).add(thumbUrl));
        },
      );
    }
    // Stop downloads and free the images when the section goes (GRID-7).
    return () => {
      controller.abort();
      for (const url of made) URL.revokeObjectURL(url);
    };
  }, [shown, load]);

  // Large images are downloaded once each, and stopped and freed with the grid (VIEW-6).
  useEffect(() => {
    const downloads = {
      controller: new AbortController(),
      asked: new Set<string>(),
      made: [] as string[],
    };
    fullDownloads.current = downloads;
    return () => {
      downloads.controller.abort();
      for (const url of downloads.made) URL.revokeObjectURL(url);
    };
  }, []);

  const viewing = open !== undefined;
  useEffect(() => {
    if (viewing) back.current?.focus();
  }, [viewing]);

  const view = (image: LookupImage) => {
    setOpen(image.thumbUrl);
    const downloads = fullDownloads.current;
    // A small original is its own thumbnail: it's already here.
    if (!downloads || image.fullUrl === image.thumbUrl || downloads.asked.has(image.fullUrl))
      return;
    downloads.asked.add(image.fullUrl);
    load(image.fullUrl, downloads.controller.signal).then(
      (blob) => {
        if (downloads.controller.signal.aborted) return;
        const url = URL.createObjectURL(blob);
        downloads.made.push(url);
        setFull((current) => new Map(current).set(image.fullUrl, url));
      },
      // The thumbnail stays (VIEW-6).
      () => undefined,
    );
  };

  const closeViewer = () => {
    focusNext.current = open;
    setOpen(undefined);
  };

  const drop = (thumbUrl: string) => {
    const url = urls.get(thumbUrl);
    if (url) URL.revokeObjectURL(url);
    setDropped((current) => new Set(current).add(thumbUrl));
  };

  const left = shown.filter(({ thumbUrl }) => !dropped.has(thumbUrl));
  if (left.length === 0) return <p>No good image found.</p>;

  const index = left.findIndex(({ thumbUrl }) => thumbUrl === open);
  const current = left[index];
  if (current) {
    const previous = left[index - 1];
    const next = left[index + 1];
    const fullUrl = full.get(current.fullUrl);
    const src = fullUrl ?? urls.get(current.thumbUrl);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft' && previous) view(previous);
      else if (event.key === 'ArrowRight' && next) view(next);
      // Cancelling the keydown keeps the <dialog> open: Esc goes back to the grid first (VIEW-5).
      else if (event.key === 'Escape') closeViewer();
      else return;
      event.preventDefault();
    };
    return (
      <div role="group" aria-label="Enlarged image" className="image-viewer" onKeyDown={onKeyDown}>
        <div className="viewer-bar">
          <button ref={back} type="button" className="pill-option" onClick={closeViewer}>
            ← Back to images
          </button>
          <span className="viewer-position">
            {index + 1} of {left.length}
          </span>
          <button
            type="button"
            className="pill-option"
            disabled={!previous}
            onClick={() => {
              if (previous) view(previous);
            }}
          >
            Previous
          </button>
          <button
            type="button"
            className="pill-option"
            disabled={!next}
            onClick={() => {
              if (next) view(next);
            }}
          >
            Next
          </button>
        </div>
        <figure>
          {/* As large as fits, at the image's own shape: 55vh is the frame's max-height (CSS). */}
          <div
            className="viewer-frame"
            style={{
              ...ratio(current),
              width: `min(100%, calc(55vh * ${String(current.width / current.height)}))`,
            }}
          >
            {src && (
              <img
                src={src}
                alt={current.alt}
                onError={() => {
                  // A large image that won't decode falls back to the thumbnail (VIEW-6).
                  if (!fullUrl) {
                    drop(current.thumbUrl);
                    return;
                  }
                  setFull((map) => {
                    const without = new Map(map);
                    without.delete(current.fullUrl);
                    return without;
                  });
                }}
              />
            )}
          </div>
          <figcaption>
            <p>{current.alt}</p>
            <FullCredit image={current} />
          </figcaption>
        </figure>
      </div>
    );
  }

  return (
    <ul className="image-grid">
      {left.map((image) => {
        const url = urls.get(image.thumbUrl);
        return (
          <li key={image.thumbUrl}>
            <button
              type="button"
              className="image-button"
              aria-label={`Enlarge: ${image.alt}`}
              ref={(button) => {
                // Back from the enlarged view: focus returns to its image (VIEW-3).
                if (button && focusNext.current === image.thumbUrl) {
                  focusNext.current = undefined;
                  button.focus();
                }
              }}
              onClick={() => {
                view(image);
              }}
            >
              {/* A square (CSS) that holds the image's place until it arrives (GRID-3, GRID-10). */}
              <div className="image-frame">
                {url && (
                  <img
                    src={url}
                    alt={image.alt}
                    onError={() => {
                      drop(image.thumbUrl);
                    }}
                  />
                )}
              </div>
            </button>
            <Credit image={image} />
          </li>
        );
      })}
    </ul>
  );
}
