// The Images section's grid of found images (docs/features/image-grid.md). Each thumbnail is
// downloaded by our code and shown as a blob: URL, never embedded from Wikimedia (decision 0005).
import type { LookupImage } from '@litsnap/shared';
import { useEffect, useState } from 'react';
import { loadImage } from './imageLoader';

type Load = (url: string, signal: AbortSignal) => Promise<Blob>;

/** Only http(s) links: these URLs come from Wikimedia, i.e. from other sites. */
const isWebUrl = (url: string | undefined): url is string => !!url && /^https?:\/\//i.test(url);

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** `{author} · {licence}`, linked, with the whole credit in the tooltip (GRID-5). */
function Credit({ image }: { image: LookupImage }) {
  const { author, licence, licenceUrl, sourceName, sourceUrl } = image.attribution;
  const whole = [image.title, author && `by ${author}`, licence, `from ${sourceName}`]
    .filter(Boolean)
    .join(', ');
  const link = (href: string | undefined, text: string) =>
    isWebUrl(href) ? (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {text}
      </a>
    ) : (
      text
    );
  return (
    <p className="image-credit" title={whole}>
      {link(sourceUrl, author ?? sourceName)}
      {licence && <> · {link(licenceUrl, licence)}</>}
    </p>
  );
}

export function ImageGrid({ images, load = loadImage }: { images: LookupImage[]; load?: Load }) {
  // Readers who asked for less motion get no GIFs, which may be animated (GRID-6).
  const [shown] = useState(() =>
    prefersReducedMotion() ? images.filter(({ mime }) => mime !== 'image/gif') : images,
  );
  /** A blob: URL per downloaded thumbnail. */
  const [urls, setUrls] = useState<ReadonlyMap<string, string>>(new Map());
  /** Thumbnails that couldn't be downloaded or decoded (GRID-4). */
  const [dropped, setDropped] = useState<ReadonlySet<string>>(new Set());

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

  const drop = (thumbUrl: string) => {
    const url = urls.get(thumbUrl);
    if (url) URL.revokeObjectURL(url);
    setDropped((current) => new Set(current).add(thumbUrl));
  };

  const left = shown.filter(({ thumbUrl }) => !dropped.has(thumbUrl));
  if (left.length === 0) return <p>No good image found.</p>;
  return (
    <ul className="image-grid">
      {left.map((image) => {
        const url = urls.get(image.thumbUrl);
        return (
          <li key={image.thumbUrl}>
            {/* Holds the image's place at its aspect ratio until it arrives (GRID-3). */}
            <div
              className="image-frame"
              style={{ aspectRatio: `${String(image.width)} / ${String(image.height)}` }}
            >
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
            <Credit image={image} />
          </li>
        );
      })}
    </ul>
  );
}
