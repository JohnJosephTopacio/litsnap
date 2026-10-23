// Debounces reading-position writes so turning pages doesn't hammer IndexedDB.
// Spec: docs/features/book-storage.md (STO-9, STO-10).
import type { Position } from './bookStore';

export interface ProgressSaver {
  /** Call on every foliate `relocate`; the last position is written `delayMs` after the last call. */
  report(position: Position): void;
  /** Writes any pending position now (the reader calls this when the page becomes hidden). */
  flush(): Promise<void>;
}

// RED PHASE: stub until the implementation PR.
export const createProgressSaver: (
  write: (position: Position) => Promise<void>,
  delayMs?: number,
) => ProgressSaver = () => {
  throw new Error('createProgressSaver is not implemented yet');
};
