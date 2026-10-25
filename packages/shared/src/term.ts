// Turns a reader's selection into the term we look up and the term we display.
// Shared so the Worker (M3) normalises exactly like the web app. Spec: docs/features/lookup-term.md.

/** The menu offers lookups for selections of 1 to this many words (spec §4.1). */
export const MAX_LOOKUP_WORDS = 6;

// RED PHASE: stubs until the implementation PR.

/** The lookup term: what the Worker receives and the Google link searches for (TERM-1…7). */
export const normalise: (selection: string) => string = () => {
  throw new Error('normalise is not implemented yet');
};

/** Words in a normalised term: space-separated pieces with a letter or digit (TERM-8). */
export const countWords: (term: string) => number = () => {
  throw new Error('countWords is not implemented yet');
};

/** The term as the modal header shows it, keeping the book's casing (TERM-9). */
export const displayTerm: (selection: string) => string = () => {
  throw new Error('displayTerm is not implemented yet');
};
