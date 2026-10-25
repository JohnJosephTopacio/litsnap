// Finds the sentence a selection came from, for the lookup modal's header (spec §4.2).
// Spec: docs/features/lookup-term.md (TERM-10…17).

/**
 * The sentence split around the selection. The modal renders `before`, then `match` in a
 * `<mark>`, then `after`, all as text: never as HTML (RD-24).
 */
export interface SourceSentence {
  before: string;
  match: string;
  after: string;
}

/** The visible length `before + match + after` is cut down to, around the match (TERM-17). */
export const MAX_SENTENCE_LENGTH = 300;

// RED PHASE: stub until the implementation PR.
export const sourceSentence: (range: Range) => SourceSentence = () => {
  throw new Error('sourceSentence is not implemented yet');
};
