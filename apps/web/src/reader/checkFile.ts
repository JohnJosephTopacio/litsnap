// Decides whether a chosen file may be opened, before foliate sees it or anything is stored.
// Spec: docs/features/epub-reader.md, "Opening a book" (RD-3, RD-4, RD-5).
import { inspectEpub } from '../epub/inspectEpub';

export type FileProblem = 'unsupported' | 'drm' | 'invalid';

/** EPUB by name or type. Anything else (PDF, text, …) isn't supported yet. */
export function looksLikeEpub(file: File): boolean {
  return file.name.toLowerCase().endsWith('.epub') || file.type === 'application/epub+zip';
}

/** `undefined` if the file can be opened, otherwise why not. */
export async function checkFile(file: File): Promise<FileProblem | undefined> {
  if (!looksLikeEpub(file)) return 'unsupported';
  const inspection = await inspectEpub(file);
  return inspection.status === 'ok' ? undefined : inspection.status;
}
