// RD-13: the table of contents. Labels are untrusted book text, rendered as text only (RD-24).
import type { TocItem } from 'foliate-js/view.js';
import { useEffect, useRef } from 'react';

interface TocPanelProps {
  items: TocItem[];
  /** The chapter currently being read, highlighted in the list. */
  currentHref: string | undefined;
  onSelect: (href: string) => void;
}

function TocList({ items, currentHref, onSelect }: TocPanelProps) {
  return (
    <ol>
      {items.map((item, i) => (
        <li key={`${item.href}-${String(i)}`}>
          <button
            type="button"
            aria-current={item.href === currentHref ? 'true' : undefined}
            onClick={() => {
              onSelect(item.href);
            }}
          >
            {item.label}
          </button>
          {item.subitems?.length ? (
            <TocList items={item.subitems} currentHref={currentHref} onSelect={onSelect} />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

export function TocPanel(props: TocPanelProps) {
  const panel = useRef<HTMLElement>(null);

  // Move focus into the panel, onto the current chapter if there is one, so keyboard users land
  // where they are in the book.
  useEffect(() => {
    const buttons = panel.current?.querySelectorAll('button');
    const current = panel.current?.querySelector<HTMLButtonElement>('[aria-current="true"]');
    (current ?? buttons?.[0])?.focus();
  }, []);

  return (
    <nav ref={panel} className="toc-panel" aria-label="Table of contents">
      {props.items.length ? <TocList {...props} /> : <p>This book has no table of contents.</p>}
    </nav>
  );
}
