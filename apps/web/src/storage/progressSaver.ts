// Debounces reading-position writes so turning pages doesn't hammer IndexedDB.
// Spec: docs/features/book-storage.md (STO-9, STO-10).
import type { Position } from './bookStore';

export interface ProgressSaver {
  /** Call on every foliate `relocate`; the last position is written `delayMs` after the last call. */
  report(position: Position): void;
  /** Writes any pending position now (the reader calls this when the page becomes hidden). */
  flush(): Promise<void>;
}

export function createProgressSaver(
  write: (position: Position) => Promise<void>,
  delayMs = 1000,
): ProgressSaver {
  let pending: Position | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function flush() {
    clearTimeout(timer);
    timer = undefined;
    // Take the pending position before awaiting, so a report() during the write isn't lost
    // and the same position is never written twice.
    const position = pending;
    pending = undefined;
    if (position) await write(position);
  }

  return {
    report(position) {
      pending = position;
      clearTimeout(timer);
      timer = setTimeout(() => {
        // The next report() schedules a fresh write, so a failed one isn't fatal.
        flush().catch(() => undefined);
      }, delayMs);
    },
    flush,
  };
}
