// The lookup modal: term, source sentence, content, Google link. Spec: docs/features/lookup-modal.md.
import type { LookupKind } from '@litsnap/shared';
import type { LookupSize } from '../storage/bookStore';
import type { LookupClient } from './client';
import type { SourceSentence } from './sourceSentence';

export interface LookupRequest {
  kind: LookupKind;
  /** The normalised lookup term (TERM-1…7): what's looked up and searched for. */
  term: string;
  /** The term as the header shows it (TERM-9). */
  display: string;
  sentence: SourceSentence;
}

interface LookupModalProps {
  request: LookupRequest;
  /** Undefined in production until M3: the modal says lookups are coming soon (MODAL-5). */
  client: LookupClient | undefined;
  size: LookupSize;
  onSizeChange: (size: LookupSize) => void;
  onClose: () => void;
}

// RED: stub until the implementation commit.
export function LookupModal(props: LookupModalProps): never {
  throw new Error(`LookupModal is not implemented yet (${props.request.term})`);
}
