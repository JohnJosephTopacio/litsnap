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

// RED: stub until the implementation commit.
export const createSelectionWatcher: (
  options: SelectionWatcherOptions,
) => SelectionWatcher = () => {
  throw new Error('createSelectionWatcher is not implemented yet');
};
