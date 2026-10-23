// Acceptance criteria STO-9 and STO-10 from docs/features/book-storage.md.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Position } from './bookStore';
import { createProgressSaver } from './progressSaver';

const at = (n: number): Position => ({ cfi: `epubcfi(/6/${String(n)}!/4/2)`, fraction: n / 100 });

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('createProgressSaver', () => {
  describe('STO-9: progress writes are debounced', () => {
    it('writes once, 1 s after the last of five quick reports, with the last position', async () => {
      const write = vi.fn<(position: Position) => Promise<void>>(() => Promise.resolve());
      const saver = createProgressSaver(write, 1000);

      for (let n = 1; n <= 5; n++) {
        saver.report(at(n));
        await vi.advanceTimersByTimeAsync(200);
      }
      // 200 ms after the last report: still waiting.
      expect(write).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(800);
      expect(write).toHaveBeenCalledTimes(1);
      expect(write).toHaveBeenCalledWith(at(5));
    });

    it('writes again for a report after the previous write', async () => {
      const write = vi.fn<(position: Position) => Promise<void>>(() => Promise.resolve());
      const saver = createProgressSaver(write, 1000);

      saver.report(at(1));
      await vi.advanceTimersByTimeAsync(1000);
      saver.report(at(2));
      await vi.advanceTimersByTimeAsync(1000);

      expect(write.mock.calls).toEqual([[at(1)], [at(2)]]);
    });
  });

  describe('STO-10: pending progress is flushed', () => {
    it('writes the pending position immediately, and not again later', async () => {
      const write = vi.fn<(position: Position) => Promise<void>>(() => Promise.resolve());
      const saver = createProgressSaver(write, 1000);

      saver.report(at(7));
      await vi.advanceTimersByTimeAsync(300);
      await saver.flush();

      expect(write).toHaveBeenCalledTimes(1);
      expect(write).toHaveBeenCalledWith(at(7));

      await vi.advanceTimersByTimeAsync(5000);
      expect(write).toHaveBeenCalledTimes(1);
    });

    it('does nothing when nothing is pending', async () => {
      const write = vi.fn<(position: Position) => Promise<void>>(() => Promise.resolve());
      const saver = createProgressSaver(write, 1000);

      saver.report(at(1));
      await vi.advanceTimersByTimeAsync(1000);
      await saver.flush();

      expect(write).toHaveBeenCalledTimes(1);
    });
  });
});
