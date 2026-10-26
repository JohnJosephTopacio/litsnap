// The Search Google ↗ fallback link (spec §4.5). Spec: docs/features/lookup-modal.md (MODAL-4).
import type { LookupKind } from '@litsnap/shared';

// RED: stub until the implementation commit.
export const googleSearchUrl: (term: string, kind: LookupKind) => string = () => {
  throw new Error('googleSearchUrl is not implemented yet');
};
