// Decides when to look at the book's selection, for the selection menu.
// Spec: docs/features/selection-menu.md (MENU-1, MENU-3, MENU-10).

/** How long a selection (or the book) must stay still before the menu appears. */
export const SETTLE_MS = 300;

export interface SelectionWatcherOptions {
  /** Identifies the current selection; `''` when nothing is selected. */
  key: () => string;
  /** Look at the selection and show the menu if it qualifies. */
  show: () => void;
  hide: () => void;
  settleMs?: number;
}

/** Feed it the book documents' events and foliate's `relocate`. */
export interface SelectionWatcher {
  pointerDown(): void;
  pointerUp(): void;
  selectionChange(): void;
  relocated(): void;
  dispose(): void;
}

export function createSelectionWatcher({
  key,
  show,
  hide,
  settleMs = SETTLE_MS,
}: SelectionWatcherOptions): SelectionWatcher {
  let pointerIsDown = false;
  /** The selection last looked at, so a repeat `selectionchange` for it changes nothing. */
  let lookedAt: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  const look = () => {
    cancel();
    lookedAt = key();
    if (lookedAt) show();
    else hide();
  };
  const lookWhenStill = () => {
    cancel();
    if (!pointerIsDown) timer = setTimeout(look, settleMs);
  };

  return {
    pointerDown() {
      pointerIsDown = true;
      cancel();
    },
    pointerUp() {
      pointerIsDown = false;
      look();
    },
    selectionChange() {
      const current = key();
      if (current === lookedAt) return;
      hide();
      lookedAt = undefined;
      lookWhenStill(); // finds nothing selected and stays hidden, if it was cleared
    },
    relocated() {
      hide();
      lookedAt = undefined;
      lookWhenStill();
    },
    dispose: cancel,
  };
}
