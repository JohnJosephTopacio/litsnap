// The Definition / Image / Both menu beside a selection. Spec: docs/features/selection-menu.md.
import type { LookupKind } from '@litsnap/shared';
import {
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type Ref,
} from 'react';
import { placeMenu, type MenuAnchor } from './placeMenu';

export const MENU_ITEMS: { kind: LookupKind; label: string; key: string }[] = [
  { kind: 'definition', label: 'Definition', key: 'D' },
  { kind: 'image', label: 'Image', key: 'I' },
  { kind: 'both', label: 'Both', key: 'B' },
];

/** The kind a shortcut key chooses (MENU-7), in either case. */
export function kindForKey(key: string): LookupKind | undefined {
  return MENU_ITEMS.find((item) => item.key === key.toUpperCase())?.kind;
}

export interface SelectionMenuHandle {
  /** MENU-11: `Tab` from the book lands on the first item. */
  focusFirst(): void;
  contains(node: Node | null): boolean;
}

interface SelectionMenuProps {
  anchor: MenuAnchor;
  onChoose: (kind: LookupKind) => void;
  ref?: Ref<SelectionMenuHandle>;
}

export function SelectionMenu({ anchor, onChoose, ref }: SelectionMenuProps) {
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number }>();

  // Measure first, then place (MENU-4…6). Hidden until placed, so it never flashes at 0,0.
  useLayoutEffect(() => {
    if (!menu.current) return;
    const { offsetWidth: width, offsetHeight: height } = menu.current;
    setPosition(placeMenu(anchor, { width, height }));
  }, [anchor]);

  const items = () => [...(menu.current?.querySelectorAll('button') ?? [])];

  useImperativeHandle(
    ref,
    () => ({
      focusFirst: () => items()[0]?.focus(),
      contains: (node) => Boolean(node && menu.current?.contains(node)),
    }),
    [],
  );

  const onKeyDown = (event: KeyboardEvent) => {
    const all = items();
    const at = all.indexOf(document.activeElement as HTMLButtonElement);
    const moves: Record<string, number> = {
      ArrowDown: (at + 1) % all.length,
      ArrowUp: (at - 1 + all.length) % all.length,
      Home: 0,
      End: all.length - 1,
    };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    all[next]?.focus();
  };

  return (
    <div
      ref={menu}
      role="menu"
      aria-label="Look up"
      aria-orientation="vertical"
      className="selection-menu"
      style={position ? { left: position.left, top: position.top } : { visibility: 'hidden' }}
      onKeyDown={onKeyDown}
    >
      {MENU_ITEMS.map(({ kind, label, key }) => (
        <button
          key={kind}
          type="button"
          role="menuitem"
          tabIndex={-1}
          aria-keyshortcuts={key}
          onClick={() => {
            onChoose(kind);
          }}
        >
          {label}
          <kbd aria-hidden="true">{key}</kbd>
        </button>
      ))}
    </div>
  );
}
